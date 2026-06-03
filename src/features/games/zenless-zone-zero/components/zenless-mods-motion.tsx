"use client";

import type { ReactNode } from "react";
import { motion, type Variants } from "framer-motion";

const rootVariants: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.04,
      staggerChildren: 0.055,
      when: "beforeChildren",
    },
  },
};

const itemVariants: Variants = {
  hidden: ({ lift = 18, rotate = 0 }: { lift?: number; rotate?: number }) => ({
    opacity: 0,
    y: lift,
    rotate,
    scale: 0.985,
  }),
  visible: ({ delay = 0 }: { delay?: number }) => ({
    opacity: 1,
    y: 0,
    rotate: 0,
    scale: 1,
    transition: {
      delay,
      duration: 0.42,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

type MotionProps = {
  children: ReactNode;
  className?: string;
};

type MotionItemProps = MotionProps & {
  delay?: number;
  lift?: number;
  rotate?: number;
};

export function ZenlessModsMotionRoot({ children, className }: MotionProps) {
  return (
    <motion.div className={className} variants={rootVariants} initial="hidden" animate="visible">
      {children}
    </motion.div>
  );
}

export function ZenlessModsMotionItem({ children, className, delay = 0, lift = 18, rotate = 0 }: MotionItemProps) {
  return (
    <motion.div className={className} variants={itemVariants} custom={{ delay, lift, rotate }}>
      {children}
    </motion.div>
  );
}

export function ZenlessModsMotionBackground({ children, className }: MotionProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
