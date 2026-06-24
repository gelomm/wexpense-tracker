import { AnimatePresence, motion } from 'framer-motion';

export const ToastContainer = ({ toasts }) => (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
    <AnimatePresence>
      {toasts.map((toast) => (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          transition={{ type: 'spring', damping: 20 }}
          className={`pointer-events-auto px-5 py-3 rounded-xl glass border border-white/10 shadow-xl text-sm font-medium max-w-md flex items-center gap-3 ${
            toast.type === 'error' ? 'text-rust-400' : toast.type === 'warning' ? 'text-amber-400' : 'text-olive-400'
          }`}
        >
          <span>{toast.type === 'error' ? '❌' : toast.type === 'warning' ? '⚠️' : '✅'}</span>
          <span>{toast.message}</span>
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);