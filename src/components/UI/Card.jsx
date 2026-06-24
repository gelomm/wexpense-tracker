export const Card = ({ children, className = '' }) => (
  <div className={`card p-5 ${className}`}>{children}</div>
);