import React from 'react';

interface WarningTriangleIconProps {
  size?: number;
  className?: string;
}

export const WarningTriangleIcon: React.FC<WarningTriangleIconProps> = ({
  size = 64,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M12 2L2 20h20L12 2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 9v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
};
