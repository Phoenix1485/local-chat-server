'use client';

import React, {
  Children,
  CSSProperties,
  ForwardedRef,
  ReactElement,
  ReactNode,
  createElement,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

type EasingValue = string | number[];

type MotionTransition = {
  duration?: number;
  delay?: number;
  ease?: EasingValue;
};

type MotionTarget = CSSProperties & {
  x?: number | string;
  y?: number | string;
  scale?: number;
  rotate?: number | string;
};

type MotionVariant = MotionTarget | string | undefined | null;
type MotionVariants = Record<string, MotionTarget>;

type ViewportOptions = {
  once?: boolean;
  margin?: string;
  amount?: number;
};

type MotionBaseProps = {
  initial?: MotionVariant;
  animate?: MotionVariant;
  exit?: MotionVariant;
  whileHover?: MotionVariant;
  whileTap?: MotionVariant;
  whileInView?: MotionVariant;
  transition?: MotionTransition;
  variants?: MotionVariants;
  viewport?: ViewportOptions;
  layout?: boolean;
};

type MotionProps<T extends keyof JSX.IntrinsicElements> = MotionBaseProps &
  Omit<React.ComponentPropsWithoutRef<T>, keyof MotionBaseProps | 'ref'>;

const EASE_MAP: Record<string, string> = {
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  linear: 'linear'
};

function asMotionTarget(value: MotionVariant, variants?: MotionVariants): MotionTarget | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    return variants?.[value];
  }
  return value;
}

function toCssSize(value: number | string | undefined): string | undefined {
  if (typeof value === 'number') {
    return `${value}px`;
  }
  return value;
}

function isZeroLike(value: number | string | undefined): boolean {
  if (typeof value === 'undefined') {
    return true;
  }
  if (typeof value === 'number') {
    return value === 0;
  }
  const normalized = value.trim().toLowerCase();
  return (
    normalized === '' ||
    normalized === '0' ||
    normalized === '0px' ||
    normalized === '0%' ||
    normalized === '0rem' ||
    normalized === '0deg' ||
    normalized === '0rad' ||
    normalized === '0turn'
  );
}

function toTransform(target: MotionTarget): string | undefined {
  const xRaw = target.x;
  const yRaw = target.y;
  const x = toCssSize(xRaw);
  const y = toCssSize(yRaw);
  const scale = target.scale;
  const rotate = target.rotate;
  const parts: string[] = [];
  if (!isZeroLike(xRaw) || !isZeroLike(yRaw)) {
    parts.push(`translate3d(${x ?? '0px'}, ${y ?? '0px'}, 0)`);
  }
  if (typeof scale === 'number' && scale !== 1) {
    parts.push(`scale(${scale})`);
  }
  if (!isZeroLike(rotate)) {
    parts.push(`rotate(${typeof rotate === 'number' ? `${rotate}deg` : rotate})`);
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function toEaseValue(ease?: EasingValue): string {
  if (!ease) {
    return 'cubic-bezier(0.22, 0.85, 0.33, 1)';
  }
  if (typeof ease === 'string') {
    return EASE_MAP[ease] ?? ease;
  }
  if (Array.isArray(ease) && ease.length === 4) {
    const [x1, y1, x2, y2] = ease;
    return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
  }
  return 'cubic-bezier(0.22, 0.85, 0.33, 1)';
}

function mergeStyles(
  baseStyle: CSSProperties | undefined,
  target: MotionTarget | undefined,
  transition?: MotionTransition
): CSSProperties | undefined {
  if (!baseStyle && !target) {
    return undefined;
  }
  const next: CSSProperties = {
    ...(baseStyle ?? {})
  };

  if (target) {
    const {
      x: _x,
      y: _y,
      scale: _scale,
      rotate: _rotate,
      ...rest
    } = target;
    Object.assign(next, rest);
    const transform = toTransform(target);
    if (transform) {
      next.transform = transform;
    }
  }

  if (transition) {
    const duration = typeof transition.duration === 'number' ? transition.duration : 0.35;
    const delay = typeof transition.delay === 'number' ? transition.delay : 0;
    next.transition = `all ${duration}s ${toEaseValue(transition.ease)} ${delay}s`;
  } else {
    next.transition = next.transition ?? 'all 0.35s cubic-bezier(0.22, 0.85, 0.33, 1)';
  }
  return next;
}

function resolveTarget(
  isMounted: boolean,
  inView: boolean,
  isHovering: boolean,
  isPressing: boolean,
  props: MotionBaseProps
): MotionTarget | undefined {
  const {
    initial,
    animate,
    whileHover,
    whileTap,
    whileInView,
    variants
  } = props;

  let target = asMotionTarget(isMounted ? animate : initial ?? animate, variants);
  if (whileInView) {
    target = asMotionTarget(inView ? whileInView : initial ?? animate, variants);
  }
  if (isHovering && whileHover) {
    target = {
      ...(target ?? {}),
      ...(asMotionTarget(whileHover, variants) ?? {})
    };
  }
  if (isPressing && whileTap) {
    target = {
      ...(target ?? {}),
      ...(asMotionTarget(whileTap, variants) ?? {})
    };
  }
  return target;
}

function assignRefs<T>(target: T | null, refs: Array<ForwardedRef<T> | undefined>) {
  refs.forEach((ref) => {
    if (!ref) {
      return;
    }
    if (typeof ref === 'function') {
      ref(target);
      return;
    }
    try {
      (ref as { current: T | null }).current = target;
    } catch {
      // noop
    }
  });
}

type RefElementForTag<T extends keyof JSX.IntrinsicElements> = T extends keyof HTMLElementTagNameMap
  ? HTMLElementTagNameMap[T]
  : HTMLElement;

function createMotionComponent<T extends keyof JSX.IntrinsicElements>(tag: T) {
  const MotionComponent = forwardRef<RefElementForTag<T>, MotionProps<T>>(function MotionComponent(
    props,
    forwardedRef
  ) {
    const {
      initial,
      animate,
      exit: _exit,
      whileHover,
      whileTap,
      whileInView,
      transition,
      variants,
      viewport,
      layout: _layout,
      style,
      onMouseEnter,
      onMouseLeave,
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      ...rest
    } = props as MotionProps<T>;

    const localRef = useRef<RefElementForTag<T> | null>(null);
    const [mounted, setMounted] = useState(false);
    const [hovering, setHovering] = useState(false);
    const [pressing, setPressing] = useState(false);
    const [inView, setInView] = useState(!whileInView);

    useEffect(() => {
      const frame = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(frame);
    }, []);

    useEffect(() => {
      if (!whileInView || !localRef.current || typeof IntersectionObserver === 'undefined') {
        return;
      }
      const once = viewport?.once ?? false;
      const threshold = typeof viewport?.amount === 'number' ? Math.min(1, Math.max(0, viewport.amount)) : 0.15;
      const observer = new IntersectionObserver(
        (entries) => {
          const nextInView = entries.some((entry) => entry.isIntersecting);
          setInView((prev) => {
            if (once && prev) {
              return true;
            }
            return nextInView;
          });
        },
        {
          rootMargin: viewport?.margin ?? '0px',
          threshold
        }
      );

      observer.observe(localRef.current);
      return () => observer.disconnect();
    }, [viewport?.amount, viewport?.margin, viewport?.once, whileInView]);

    const target = useMemo(
      () =>
        resolveTarget(mounted, inView, hovering, pressing, {
          initial,
          animate,
          whileHover,
          whileTap,
          whileInView,
          transition,
          variants
        }),
      [animate, hovering, inView, initial, mounted, pressing, transition, variants, whileHover, whileInView, whileTap]
    );

    const mergedStyle = useMemo(() => mergeStyles(style as CSSProperties | undefined, target, transition), [style, target, transition]);

    return createElement(tag, {
      ...rest,
      style: mergedStyle,
      ref: (node: RefElementForTag<T> | null) => assignRefs(node, [localRef, forwardedRef]),
      onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
        setHovering(true);
        if (onMouseEnter) {
          onMouseEnter(event as never);
        }
      },
      onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
        setHovering(false);
        setPressing(false);
        if (onMouseLeave) {
          onMouseLeave(event as never);
        }
      },
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        setPressing(true);
        if (onPointerDown) {
          onPointerDown(event as never);
        }
      },
      onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
        setPressing(false);
        if (onPointerUp) {
          onPointerUp(event as never);
        }
      },
      onPointerCancel: (event: React.PointerEvent<HTMLElement>) => {
        setPressing(false);
        if (onPointerCancel) {
          onPointerCancel(event as never);
        }
      }
    });
  });

  MotionComponent.displayName = `motion.${String(tag)}`;
  return MotionComponent;
}

export const motion = {
  article: createMotionComponent('article'),
  aside: createMotionComponent('aside'),
  button: createMotionComponent('button'),
  div: createMotionComponent('div'),
  form: createMotionComponent('form'),
  h1: createMotionComponent('h1'),
  h2: createMotionComponent('h2'),
  h3: createMotionComponent('h3'),
  header: createMotionComponent('header'),
  li: createMotionComponent('li'),
  main: createMotionComponent('main'),
  nav: createMotionComponent('nav'),
  p: createMotionComponent('p'),
  section: createMotionComponent('section'),
  span: createMotionComponent('span'),
  ul: createMotionComponent('ul')
} as const;

type AnimatePresenceProps = {
  children: ReactNode;
  initial?: boolean;
  mode?: 'sync' | 'wait' | 'popLayout';
};

export function AnimatePresence({ children }: AnimatePresenceProps) {
  return <>{Children.toArray(children) as ReactElement[]}</>;
}

export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPrefersReducedMotion(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  return prefersReducedMotion;
}

export type { MotionProps, MotionTarget, MotionTransition, MotionVariants };
