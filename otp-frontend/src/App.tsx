import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import "./App.css";

// --- Constants ---
const API_BASE = "http://localhost:8080";
const OTP_LENGTH = 4;
const OTP_TTL = 60; // seconds until OTP considered expired
const MESSAGE_TIMEOUT = 5000; // ms to display messages
const [blockAutoSubmit, setBlockAutoSubmit] = useState(false);
// --- Types & Enums ---
interface OtpResponse {
  otp: string;
  expiresAt?: string;
}

interface ValidationResponse {
  valid: boolean;
  message?: string;
}

const MessageType = {
  SUCCESS: "success",
  ERROR: "error",
  INFO: "info",
  WARNING: "warning",
} as const;

type MessageType = (typeof MessageType)[keyof typeof MessageType];

interface Message {
  text: string;
  type: MessageType;
}

// --- Custom Hook for Countdown ---

/**
 * Manages the countdown timer state.
 * Moved logic out of App for stability and separation.
 */
function useTimerCountdown(targetExpiresAt: number | null, onExpire: () => void) {
    const [seconds, setSeconds] = useState(0);
    
    // Use a ref for the onExpire callback to avoid useEffect dependency hell
    const onExpireRef = useRef(onExpire);
    onExpireRef.current = onExpire;

    useEffect(() => {
        let timer: number | undefined;
        
        if (targetExpiresAt) {
            const tick = () => {
                const sec = Math.max(0, Math.ceil((targetExpiresAt - Date.now()) / 1000));
                setSeconds(sec);
                if (sec <= 0) {
                    window.clearInterval(timer);
                    onExpireRef.current(); // Call onExpire through ref
                }
            };
            
            tick(); // Initial call
            timer = window.setInterval(tick, 1000);
        } else {
            setSeconds(0);
        }
        
        return () => {
            if (timer) window.clearInterval(timer);
        };
    }, [targetExpiresAt]);

    return seconds;
}


// --- Components ---

/**
 * 🧩 OtpInput Component
 * Now relies on a prop (isSubmitting) instead of an internal ref for external state.
 */function OtpInput({
  value,
  onChange,
  length = OTP_LENGTH,
  disabled = false,
  isSubmitting = false,
  onComplete,
  id,
  disableAnimations = false,   // <-- ADD THIS
}: {
  value: string;
  onChange: (val: string) => void;
  length?: number;
  disabled?: boolean;
  isSubmitting?: boolean;
  onComplete?: (otp: string) => void;
  id?: string;
  disableAnimations?: boolean; // <-- ADD THIS
}) {

  const vals = useMemo(() => value.split("").slice(0, length), [value, length]);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [activeInputIndex, setActiveInputIndex] = useState(0);

  // Focus utility
  const focusAt = useCallback(
    (i: number) => {
      const clampedIndex = Math.max(0, Math.min(length - 1, i));
      const el = refs.current[clampedIndex];
      if (el && !disabled && !isSubmitting) {
        el.focus();
        el.select();
        setActiveInputIndex(clampedIndex);
      }
    },
    [disabled, isSubmitting, length]
  );
  
  // Update refs size
  useEffect(() => {
    refs.current = refs.current.slice(0, length);
  }, [length]);

  // Auto-focus first empty input on mount or when disabling state changes
useEffect(() => {
  if (disableAnimations) return; // <-- prevents flicker focus

  if (!disabled && !isSubmitting) {
    const firstEmptyIndex = vals.findIndex((v) => !v);
    focusAt(firstEmptyIndex === -1 ? length - 1 : firstEmptyIndex);
  }
}, [disabled, isSubmitting, disableAnimations]);


  // Trigger onComplete
  useEffect(() => {
    if (value.length !== length || !onComplete || isSubmitting) return;

    // Small debounce to ensure all handlers settle before calling external action
    const timer = setTimeout(() => {
      onComplete(value);
    }, 100); 

    return () => clearTimeout(timer);
  }, [value, length, onComplete, isSubmitting]);

  const handleChange = (i: number, v: string) => {
    if (disabled || isSubmitting) return;

    const digit = v.replace(/[^0-9]/g, "").slice(-1);
    
    // Only proceed if a new digit was entered or cleared
    if (!digit && !vals[i]) return;

    const chars = [...vals];
    chars[i] = digit;
    const joined = chars.join("").slice(0, length);

    onChange(joined);

    if (digit && i < length - 1) {
      focusAt(i + 1);
    } else if (digit && i === length - 1) {
        // Blur when full
        refs.current[i]?.blur();
        setActiveInputIndex(-1);
    }
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled || isSubmitting) return;

    const key = e.key;
    
    // Allow normal numeric typing
    if (/^[0-9]$/.test(key)) return;
    
    if (key === "Backspace") {
      e.preventDefault();
      const arr = [...vals];

      if (vals[i]) {
        // Clear current digit
        arr[i] = "";
        onChange(arr.join(""));
      } else if (i > 0) {
        // Clear previous digit and move focus back
        arr[i - 1] = "";
        onChange(arr.join(""));
        focusAt(i - 1);
      }
    } else if (key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      focusAt(i - 1);
    } else if (key === "ArrowRight" && i < length - 1) {
      e.preventDefault();
      focusAt(i + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (disabled || isSubmitting) return;

    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/[^0-9]/g, "");
    if (!text) return;

    // Fill from the beginning
    const arr = Array(length).fill("");
    for (let i = 0; i < Math.min(length, text.length); i++) {
      arr[i] = text[i];
    }
    const joined = arr.join("").slice(0, length);
    onChange(joined);

    // Focus last input if full, or next empty
    const nextEmpty = joined.split("").findIndex((c) => !c);
    if (nextEmpty === -1) {
      refs.current[length - 1]?.blur();
      setActiveInputIndex(-1);
    } else {
      focusAt(nextEmpty);
    }
  };
  
  const finalDisabled = disabled || isSubmitting;

  return (
    <div 
      id={id}
        className="flex gap-4 justify-center mb-8" 
        role="group" 
        aria-label={`${length}-digit OTP input`}
        onBlur={() => setActiveInputIndex(-1)}
    >
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric"
          pattern="[0-9]*"
          type="text"
          maxLength={1}
          aria-label={`Digit ${i + 1} of ${length}`}
          className={`w-20 h-20 md:w-24 md:h-24 text-4xl md:text-5xl text-center rounded-xl border-4 bg-white shadow-lg transition-all duration-300 font-mono font-black otp-input ${
            finalDisabled
              ? "opacity-50 cursor-not-allowed border-gray-200"
              : vals[i]
                ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-emerald-200/50"
                : activeInputIndex === i 
                    ? "border-indigo-500 shadow-indigo-200/50" // Active styling
                    : "border-gray-300 hover:border-indigo-400 hover:shadow-indigo-200/30"
          } ${isSubmitting || disableAnimations ? "" : "animate-pulse"}`}
          value={vals[i] || ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={() => setActiveInputIndex(i)}
          onPaste={handlePaste}
          disabled={finalDisabled}
          autoComplete="one-time-code"
          placeholder=""
        />
      ))}
    </div>
  );
}

function AnimatedOtpDisplay({ otp, isExpired }: { otp: string; isExpired: boolean }) {
  if (!otp) return null;

  return (
    <div className="mb-8" aria-live="polite">
      <div className="flex gap-4 justify-center mb-4">
        {otp.padEnd(OTP_LENGTH, " ").slice(0, OTP_LENGTH).split("").map((char, i) => {
          const isEmpty = char === " ";
          return (
            <div
              key={i}
              className={`w-20 h-20 md:w-24 md:h-24 flex items-center justify-center text-4xl md:text-5xl font-mono font-black rounded-xl shadow-lg transition-all duration-300 ${
                isEmpty
                  ? "bg-gray-100 text-gray-400 border-2 border-gray-200"
                  : isExpired
                    ? "bg-gradient-to-br from-red-500 to-red-700 text-white animate-pulse shadow-red-300/50"
                    : "bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white animate-otp-pop shadow-purple-300/50"
              }`}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              {isEmpty ? "•" : char}
            </div>
          );
        })}
      </div>
      <p className={`text-center text-lg font-semibold ${isExpired ? "text-red-600" : "text-gray-700"}`}>
        {isExpired ? "⚠️ OTP has expired" : "📋 Generated OTP - Copy or type into input below"}
      </p>
    </div>
  );
}

function CountdownTimer({ seconds }: { seconds: number }) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const percentage = Math.max(0, Math.min(100, (seconds / OTP_TTL) * 100));
  
  const timerColor = useMemo(() => {
    if (seconds > 20) return "bg-emerald-400 text-emerald-600";
    if (seconds > 10) return "bg-yellow-400 text-yellow-600";
    return "bg-red-400 text-red-600";
  }, [seconds]);

  return (
    <div className="flex items-center gap-3" role="timer" aria-live="off">
      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${timerColor.split(' ')[0]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={`text-sm font-mono font-bold ${timerColor.split(' ')[1]}`}>
        {minutes.toString().padStart(2, "0")}:{secs.toString().padStart(2, "0")}
      </span>
    </div>
  );
}

function MessageDisplay({ message }: { message: Message | null }) {
  if (!message) return null;

  const styles: Record<MessageType, string> = {
    [MessageType.SUCCESS]: "bg-emerald-50 text-emerald-700 border-emerald-200",
    [MessageType.ERROR]: "bg-red-50 text-red-700 border-red-200",
    [MessageType.WARNING]: "bg-yellow-50 text-yellow-700 border-yellow-200",
    [MessageType.INFO]: "bg-blue-50 text-blue-700 border-blue-200",
  };

  const icons: Record<MessageType, string> = {
    [MessageType.SUCCESS]: "✅",
    [MessageType.ERROR]: "❌",
    [MessageType.WARNING]: "⚠️",
    [MessageType.INFO]: "ℹ️",
  };

  return (
    <div
      className={`mx-auto w-fit px-4 py-3 rounded-lg border font-medium animate-fade-in ${styles[message.type]}`}
      role="status"
      aria-live="polite"
    >
      <span className="mr-2">{icons[message.type]}</span>
      {message.text}
    </div>
  );
}

// --- Main Application Component ---

export default function App() {
  const [otp, setOtp] = useState("");
  const [inputOtp, setInputOtp] = useState("");
  const [loading, setLoading] = useState(false); // For Generate button
  const [isSubmitting, setIsSubmitting] = useState(false); // <--- NEW STATE for validation
  const [message, setMessage] = useState<Message | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  
  // Custom hook usage
  const countdown = useTimerCountdown(expiresAt, () => {
    showMessage("⏳ The generated OTP has expired. Please generate a new one.", MessageType.WARNING);
  });
  
  const isExpired = countdown === 0 && otp !== "";

  const showMessage = useCallback((text: string, type: MessageType) => {
    setMessage({ text, type });
    const timeoutId = window.setTimeout(() => setMessage(null), MESSAGE_TIMEOUT);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const clearAll = () => {
    setInputOtp("");
    setMessage(null);
    setOtp("");
    setExpiresAt(null);
    setLoading(false);
setTimeout(() => setIsSubmitting(false), 50);

   };
  
  const fetchOtp = async () => {
    if (loading || isSubmitting) return;

    setLoading(true);
    setMessage(null);
    setInputOtp("");

    try {
      const res = await fetch(`${API_BASE}/get-otp`);
      if (!res.ok) {
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      const data: OtpResponse = await res.json();
      if (!data || typeof data.otp !== "string" || data.otp.length !== OTP_LENGTH) {
        throw new Error("Invalid OTP format received from server");
      }

      setOtp(data.otp);
      // Use Date.now() for calculation, but the hook will handle ticking.
      setExpiresAt(Date.now() + OTP_TTL * 1000); 
      showMessage(`OTP generated successfully — valid for ${OTP_TTL} seconds`, MessageType.SUCCESS);
    } catch (err) {
      console.error("Failed to fetch OTP:", err);
      showMessage(
        err instanceof Error ? `API Error: ${err.message}` : "Failed to generate OTP. Please check your connection.",
        MessageType.ERROR
      );
    } finally {
      setLoading(false);
    }
  };

  const validateOtp = useCallback(
    async (otpToCheck?: string) => {
      const otpValue = otpToCheck ?? inputOtp;
      
      if (otpValue.length !== OTP_LENGTH) {
        showMessage(`Please enter all ${OTP_LENGTH} digits`, MessageType.WARNING);
        return;
      }

      if (isSubmitting || loading) return;

      setIsSubmitting(true);
      setMessage(null);

      try {
        const res = await fetch(`${API_BASE}/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ otp: otpValue }),
        });

        if (!res.ok) {
          throw new Error(`Server error: ${res.status} ${res.statusText}`);
        }

        const data: ValidationResponse = await res.json();
        if (typeof data.valid !== "boolean") {
          throw new Error("Invalid response format from server");
        }

        if (data.valid) {
          showMessage("🎉 OTP verified successfully! Clearing state...", MessageType.SUCCESS);
          setTimeout(clearAll, 1200);
        } else {
          showMessage(data.message || "OTP is invalid or has expired", MessageType.ERROR);
          // Only stop the submitting flag here, so the user can correct the input
       setIsSubmitting(false);
setBlockAutoSubmit(true);
        }
      } catch (err) {
        console.error("Failed to validate OTP:", err);
        showMessage(
          err instanceof Error ? `Validation Error: ${err.message}` : "Validation failed. Please try again.",
          MessageType.ERROR
        );
        setIsSubmitting(false);
        setBlockAutoSubmit(true);
      }
    },
    [inputOtp, showMessage, isSubmitting, loading]
  );

  const copyOtp = async () => {
    if (!otp) {
        showMessage("No OTP to copy. Generate one first.", MessageType.WARNING);
        return;
    }
    try {
      await navigator.clipboard.writeText(otp);
      showMessage("OTP copied to clipboard 🚀", MessageType.INFO);
    } catch {
      showMessage("Failed to copy OTP. Please copy manually.", MessageType.ERROR);
    }
  };

  const handleOtpComplete = useCallback(
    (completedOtp: string) => {
    if (completedOtp.length !== OTP_LENGTH) return;

// If last attempt was invalid, block auto submission once
if (blockAutoSubmit) {
  setBlockAutoSubmit(false);
  return;
}

if (!isSubmitting && !loading) {
  validateOtp(completedOtp);
}

    },
    [validateOtp, isSubmitting, loading]
  );
  
  // Determine if any main action is preventing input
  const isActionDisabled = loading || isSubmitting || isExpired;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-2xl bg-white/90 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border border-white/50">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-2xl" aria-hidden="true">
              🔐
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-gray-800">
              OTP Validator
            </h1>
          </div>
          <p className="text-gray-600 text-lg">
            Secure 4-digit one-time passcode verification system demo
          </p>
        </header>

        <main className="space-y-6">
          {/* Generate OTP Section */}
          <div className="text-center">
            <button
              onClick={fetchOtp}
              disabled={loading || isSubmitting}
              className={`px-8 py-4 rounded-2xl font-bold text-lg text-white shadow-lg transition-all duration-200 ${
                loading || isSubmitting
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transform hover:scale-105"
              }`}
            >
              {loading ? (
                <span className="flex items-center gap-2 justify-center">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </span>
              ) : (
                "🎲 Generate New OTP"
              )}
            </button>
          </div>

          {/* OTP Display */}
          <AnimatedOtpDisplay otp={otp} isExpired={isExpired} />

          {/* Timer */}
          {otp && (
            <div className="space-y-4 bg-gray-50 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-gray-700">Time remaining:</span>
                <button
                  onClick={copyOtp}
                  disabled={isSubmitting}
                  className="text-sm px-4 py-2 rounded-xl bg-white hover:bg-gray-100 text-gray-700 font-medium transition-all duration-200 shadow-md hover:shadow-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  📋 Copy OTP
                </button>
              </div>
              <CountdownTimer seconds={countdown} />
            </div>
          )}

          {/* Input Section */}
          <div className="space-y-6">
            <div className="text-center">
              <label className="block text-2xl font-bold text-gray-800 mb-6" htmlFor="otp-input-group">
                Enter OTP to Validate
              </label>
              <OtpInput
  value={inputOtp}
  onChange={setInputOtp}
  disabled={isActionDisabled}
  isSubmitting={isSubmitting}
  disableAnimations={message?.type === MessageType.ERROR}   // <-- ADD THIS
  onComplete={handleOtpComplete}
  id="otp-input-group"
/>

            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => validateOtp()}
                disabled={isActionDisabled || inputOtp.length !== OTP_LENGTH}
                className={`px-8 py-3 rounded-xl font-bold text-lg transition-all duration-200 ${
                  isActionDisabled || inputOtp.length !== OTP_LENGTH
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg transform hover:scale-105"
                }`}
              >
                {isSubmitting ? "Validating..." : "✓ Validate OTP"}
              </button>

              <button
                onClick={clearAll}
                disabled={isSubmitting}
                className="px-6 py-3 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🗑️ Clear All
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="mt-6">
            <MessageDisplay message={message} />
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-gray-200">
          <div className="text-center text-sm text-gray-500">
            <p>🔗 Connected to: <code className="bg-gray-100 px-2 py-1 rounded">{API_BASE}</code></p>
            <p className="mt-1">Ensure your Go backend is running with CORS enabled.</p>
          </div>
        </footer>
      </div>

      {/* Enhanced Styles */}
      <style>{`
        .otp-input {
          transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
          border-width: 4px;
          font-size: 2.5rem;
          line-height: 1;
          caret-color: #6366f1;
          text-align: center !important;
          vertical-align: middle;
        }
        /* Active/Focus styling relies on component state now */
        .otp-input:focus {
          transform: translateY(-5px) scale(1.06);
          box-shadow:
            0 30px 60px -20px rgba(0, 0, 0, 0.18),
            0 0 0 6px rgba(99, 102, 241, 0.16),
            0 0 40px rgba(99, 102, 241, 0.22);
          outline: none;
          /* The component actively sets border-indigo-500 */
        }
        .otp-input:hover:not(:disabled) {
          transform: translateY(-2px) scale(1.03);
          box-shadow: 0 24px 40px -12px rgba(0, 0, 0, 0.12), 0 10px 18px -8px rgba(0, 0, 0, 0.05);
        }

        @keyframes otp-pop {
          0% {
            transform: translateY(36px) scale(0.68);
            opacity: 0;
            rotate: -6deg;
          }
          50% {
            transform: translateY(-12px) scale(1.14);
            opacity: 1;
            rotate: 3deg;
          }
          100% {
            transform: translateY(0) scale(1);
            rotate: 0deg;
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-otp-pop {
          animation: otp-pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }

        .animate-fade-in {
          animation: fade-in 0.35s ease-out both;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
          .otp-input {
            width: 4rem;
            height: 4.5rem;
            font-size: 2.2rem !important;
          }
        }
        @media (min-width: 769px) {
          .otp-input {
            width: 5.5rem;
            height: 6.5rem;
            font-size: 3rem !important;
          }
        }
      `}</style>
    </div>
  );
}