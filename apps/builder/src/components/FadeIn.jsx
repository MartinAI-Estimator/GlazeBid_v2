import { motion } from 'framer-motion';

/**
 * FadeIn — Lightweight Framer Motion wrapper for the "assembled" entrance effect.
 * Accepts an optional `style` prop so grid column spans pass through correctly.
 *
 * Usage:
 *   <FadeIn delay={0.1} style={{ gridColumn: 'span 8' }}>
 *     <MyCard />
 *   </FadeIn>
 */
const FadeIn = ({ children, delay = 0, style, className }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay, ease: [0.23, 1, 0.32, 1] }}
    style={style}
    className={className}
  >
    {children}
  </motion.div>
);

export default FadeIn;
