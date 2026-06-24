export const Spinner = ({ size = 'md' }) => {
  const sizes = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };
  return (
    <div
      className={`${sizes[size]} border-olive-500/30 border-t-olive-500 rounded-full animate-spin`}
    />
  );
};