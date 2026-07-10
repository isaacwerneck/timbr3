import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

interface InfoDotProps {
  description: string;
  className?: string;
}

export const InfoDot: React.FC<InfoDotProps> = ({ description, className = '' }) => {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    setPosition({
      top: Math.max(8, rect.top - 10),
      left: rect.left + rect.width / 2,
    });
  };

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleScroll = () => updatePosition();
    const handleResize = () => updatePosition();

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen]);

  return (
    <span
      ref={triggerRef}
      className={`info-dot relative inline-flex items-center justify-center align-middle ${className}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
      tabIndex={0}
      aria-label={description}
    >
      <Info className="w-3 h-3 text-[#8e95a0] opacity-55 transition-opacity hover:opacity-100 focus:opacity-100" />
      {isOpen && typeof document !== 'undefined' && createPortal(
        <span
          className="pointer-events-none fixed z-[9999] w-56 -translate-x-1/2 rounded border border-[#3a414c] bg-[#14181d] px-2.5 py-2 text-left font-mono text-[7px] leading-relaxed tracking-wide text-[#d3d8df] shadow-[0_10px_24px_rgba(0,0,0,0.45)] whitespace-normal"
          style={{
            left: `${position.left}px`,
            top: `${position.top}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {description}
        </span>,
        document.body,
      )}
    </span>
  );
};