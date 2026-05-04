import React, { useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { reportLynk } from '../../lib/lynkService';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';

const REASONS = [
  'Spam or misleading',
  'Hate speech',
  'Violence or graphic content',
  'Nudity or sexual content',
  'Harassment',
  'Other',
];

interface Props {
  lynkId: string;
  onClose: () => void;
}

export default function LynkReportModal({ lynkId, onClose }: Props) {
  const { user } = useAuth();
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!user || !selected) return;
    setLoading(true);
    await reportLynk(lynkId, user.uid, selected);
    toast.success('Report submitted. Thank you.');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <motion.div
        className="w-full max-w-md bg-background rounded-t-2xl p-6"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Report Lynk</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-2 mb-6">
          {REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setSelected(r)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                selected === r ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!selected || loading}
          className="w-full py-3 bg-destructive text-destructive-foreground rounded-full font-bold disabled:opacity-40"
        >
          {loading ? 'Submitting…' : 'Submit Report'}
        </button>
      </motion.div>
    </div>
  );
}
