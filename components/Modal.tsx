import React, { useEffect } from 'react';
import { Mechanism } from '../types';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: Mechanism | null;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, data }) => {
  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
      <div 
        className="bg-white dark:bg-medical-surface w-full max-w-md rounded-xl shadow-2xl border border-slate-200 dark:border-medical-line overflow-hidden transform transition-all scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xl font-bold text-slate-800 dark:text-cyan-300 font-mono tracking-tight">
              {data.name}
            </h3>
            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold block mb-1">功能与作用 (Function & Role)</span>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 p-2 rounded">
                {data.role}
              </p>
            </div>
            
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold block mb-1">临床意义 (Clinical Significance)</span>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm">
                {data.description}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 border-t border-slate-100 dark:border-medical-line text-right">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          >
            关闭 (Close)
          </button>
        </div>
      </div>
    </div>
  );
};

export default Modal;