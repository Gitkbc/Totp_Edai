import { useEffect, useRef, useState, useCallback } from "react";
import "./App.css";

const API_BASE = "http://localhost:8080";
const OTP_LENGTH = 6;
const OTP_TTL = 60; // seconds until OTP considered expired

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
  WARNING: "warning"
} as const;
type MessageType = typeof MessageType[keyof typeof MessageType];

interface Message {
  text: string;
  type: MessageType;
}

function OtpInput({
  value,
  onChange,
  length = OTP_LENGTH,
  disabled = false,
  onComplete,
}: {
  value: string;
  onChange: (val: string) => void;
  length?: number;
  disabled?: boolean;
  onComplete?: (otp: string) => void;
}) {
  const vals = value.padEnd(length).split("").slice(0, length);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    refs.current = refs.current.slice(0, length);
  }, [length]);

  useEffect(() => {
    if (value.length === length && onComplete) {
      onComplete(value);
    }
  }, [value, length, onComplete]);

  const focusAt = useCallback((i: number) => {
    const el = refs.current[i];
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

const handleChange = (i: number, v: string) => {
  if (disabled) return;

  const digit = v.replace(/[^0-9]/g, "").slice(-1);

  // Work off the current value directly
  const chars = value.split("");
  chars[i] = digit;
  const joined = chars.join("");

  onChange(joined);

  // Immediately advance to next field
  if (digit && i < length - 1) {
    focusAt(i + 1);
  }
};


  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    
    const key = e.key;
    
    // Allow numeric keys to pass through normally
    if (/^[0-9]$/.test(key)) {
      // Let the normal onChange handle it
      return;
    }
    
    if (key === "Backspace") {
      e.preventDefault();
      const arr = [...vals];
      
      if (vals[i]) {
        // Clear current field
        arr[i] = "";
        onChange(arr.join("").replace(/\s/g, ""));
      } else if (i > 0) {
        // Move to previous field and clear it
        arr[i - 1] = "";
        onChange(arr.join("").replace(/\s/g, ""));
        setTimeout(() => focusAt(i - 1), 10);
      }
    } else if (key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      focusAt(i - 1);
    } else if (key === "ArrowRight" && i < length - 1) {
      e.preventDefault();
      focusAt(i + 1);
    } else if (key === "Delete") {
      e.preventDefault();
      const arr = [...vals];
      arr[i] = "";
      onChange(arr.join("").replace(/\s/g, ""));
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (disabled) return;
    
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/[^0-9]/g, "");
    if (!text) return;
    
    const arr = [...vals];
    for (let i = 0; i < Math.min(length, text.length); i++) {
      arr[i] = text[i];
    }
    const joined = arr.join("").slice(0, length);
    onChange(joined);
    
    // Focus appropriate field
    const nextEmpty = joined.split("").findIndex((c) => !c);
    if (nextEmpty === -1) {
      focusAt(length - 1);
    } else {
      focusAt(nextEmpty);
    }
  };

  return (
    <div className="flex gap-4 justify-center mb-8" role="group" aria-label={`${length}-digit OTP input`}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          id={`otp-input-${i}`}
          inputMode="numeric"
          pattern="[0-9]*"
          type="text"


          maxLength={1}
          aria-label={`Digit ${i + 1} of ${length}`}
          className={`w-28 h-32 md:w-36 md:h-40 text-6xl md:text-7xl text-center rounded-3xl border-4 bg-white shadow-2xl transition-all duration-300 font-mono font-black otp-input ${
            disabled 
              ? "opacity-50 cursor-not-allowed border-gray-200" 
              : vals[i] 
                ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-emerald-200/50" 
                : "border-gray-300 hover:border-indigo-400 focus:border-indigo-500 hover:shadow-indigo-200/30"
          }`}
          value={vals[i] || ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
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
    <div className="mb-8">
      <div className="flex gap-4 justify-center mb-4">
        {otp.padEnd(OTP_LENGTH, " ").slice(0, OTP_LENGTH).split("").map((char, i) => {
          const isEmpty = char === " ";
          return (
            <div
              key={i}
              className={`w-28 h-32 md:w-36 md:h-40 flex items-center justify-center text-6xl md:text-7xl font-mono font-black rounded-3xl shadow-2xl transition-all duration-300 ${
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

function CountdownTimer({ seconds, onExpire }: { seconds: number; onExpire: () => void }) {
  useEffect(() => {
    if (seconds <= 0) {
      onExpire();
    }
  }, [seconds, onExpire]);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const percentage = (seconds / OTP_TTL) * 100;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${
            seconds > 20 ? "bg-emerald-400" : seconds > 10 ? "bg-yellow-400" : "bg-red-400"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={`text-sm font-mono font-bold ${
        seconds > 20 ? "text-emerald-600" : seconds > 10 ? "text-yellow-600" : "text-red-600"
      }`}>
        {minutes}:{secs.toString().padStart(2, "0")}
      </span>
    </div>
  );
}

function MessageDisplay({ message }: { message: Message | null }) {
  if (!message) return null;

  const styles = {
    [MessageType.SUCCESS]: "bg-emerald-50 text-emerald-700 border-emerald-200",
    [MessageType.ERROR]: "bg-red-50 text-red-700 border-red-200",
    [MessageType.WARNING]: "bg-yellow-50 text-yellow-700 border-yellow-200",
    [MessageType.INFO]: "bg-blue-50 text-blue-700 border-blue-200",
  };

  const icons = {
    [MessageType.SUCCESS]: "✅",
    [MessageType.ERROR]: "❌",
    [MessageType.WARNING]: "⚠️",
    [MessageType.INFO]: "ℹ️",
  };

  return (
    <div 
      className={`mx-auto w-fit px-4 py-3 rounded-lg border font-medium animate-fade-in ${styles[message.type]}`}
      role="alert"
    >
      <span className="mr-2">{icons[message.type]}</span>
      {message.text}
    </div>
  );
}

export default function App() {
  const [otp, setOtp] = useState("");
  const [inputOtp, setInputOtp] = useState("");
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  // Countdown timer effect
  useEffect(() => {
    let timer: number | undefined;
    if (expiresAt) {
      const tick = () => {
        const sec = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
        setCountdown(sec);
        if (sec <= 0) {
          setExpiresAt(null);
          window.clearInterval(timer);
        }
      };
      tick();
      timer = window.setInterval(tick, 1000);
    } else {
      setCountdown(0);
    }
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [expiresAt]);

  const showMessage = useCallback((text: string, type: MessageType) => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }, []);

  const fetchOtp = async () => {
    setLoading(true);
    setMessage(null);
    setIsValid(null);
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
      setExpiresAt(Date.now() + OTP_TTL * 1000);
      showMessage(`OTP generated successfully — valid for ${OTP_TTL} seconds`, MessageType.SUCCESS);
    } catch (err) {
      console.error("Failed to fetch OTP:", err);
      showMessage(
        err instanceof Error ? err.message : "Failed to generate OTP. Please check your connection.",
        MessageType.ERROR
      );
    } finally {
      setLoading(false);
    }
  };

  // update validateOtp to accept an optional otp param
  const validateOtp = async (otpToCheck?: string) => {
    const otpValue = otpToCheck ?? inputOtp;
    if (otpValue.length !== OTP_LENGTH) {
      showMessage(`Please enter all ${OTP_LENGTH} digits`, MessageType.WARNING);
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/validate-otp`, {
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

      setIsValid(data.valid);

      if (data.valid) {
        showMessage("🎉 OTP verified successfully!", MessageType.SUCCESS);
        // Clear everything on successful validation
        setTimeout(() => {
          setInputOtp("");
          setOtp("");
          setExpiresAt(null);
          setIsValid(null);
        }, 1200);
      } else {
        showMessage(data.message || "OTP is invalid or has expired", MessageType.ERROR);
      }
    } catch (err) {
      console.error("Failed to validate OTP:", err);
      showMessage(
        err instanceof Error ? err.message : "Validation failed. Please try again.",
        MessageType.ERROR
      );
    } finally {
      setLoading(false);
    }
  };

  const copyOtp = async () => {
    try {
      await navigator.clipboard.writeText(otp);
      showMessage("OTP copied to clipboard", MessageType.INFO);
    } catch {
      showMessage("Failed to copy OTP", MessageType.ERROR);
    }
  };

  const clearAll = () => {
    setInputOtp("");
    setIsValid(null);
    setMessage(null);
    setOtp("");
    setExpiresAt(null);
  };

  // update handleOtpComplete to pass completed OTP to validator
  const handleOtpComplete = useCallback((completedOtp: string) => {
    console.log(`OTP Complete: "${completedOtp}"`); // Debug log
    if (completedOtp.length === OTP_LENGTH) {
      validateOtp(completedOtp);
    }
  }, [validateOtp]); // Add validateOtp as dependency

  const isExpired = countdown === 0 && otp !== "";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-2xl bg-white/90 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border border-white/50">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-2xl">
              🔐
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-gray-800">
              OTP Validator
            </h1>
          </div>
          <p className="text-gray-600 text-lg">
            Enterprise-grade 6-digit one-time passcode verification system
          </p>
        </header>

        <main className="space-y-6">
          {/* Generate OTP Section */}
          <div className="text-center">
            <button
              onClick={fetchOtp}
              disabled={loading}
              className={`px-8 py-4 rounded-2xl font-bold text-lg text-white shadow-lg transition-all duration-200 ${
                loading 
                  ? "bg-gray-400 cursor-not-allowed" 
                  : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transform hover:scale-105"
              }`}
            >
              {loading ? (
                <span className="flex items-center gap-2">
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
                  className="text-sm px-4 py-2 rounded-xl bg-white hover:bg-gray-100 text-gray-700 font-medium transition-all duration-200 shadow-md hover:shadow-lg border border-gray-200"
                >
                  📋 Copy OTP
                </button>
              </div>
              <CountdownTimer 
                seconds={countdown} 
                onExpire={() => showMessage("OTP has expired. Generate a new one.", MessageType.WARNING)} 
              />
            </div>
          )}

          {/* Input Section */}
          <div className="space-y-6">
            <div className="text-center">
              <label className="block text-2xl font-bold text-gray-800 mb-6">
                Enter OTP to Validate
              </label>
              <OtpInput 
                value={inputOtp} 
                onChange={setInputOtp} 
                disabled={loading || isExpired}
                onComplete={handleOtpComplete}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => validateOtp()}
                disabled={loading || inputOtp.length !== OTP_LENGTH || isExpired}
                className={`px-8 py-3 rounded-xl font-bold text-lg transition-all duration-200 ${
                  loading || inputOtp.length !== OTP_LENGTH || isExpired
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg transform hover:scale-105"
                }`}
              >
                {loading ? "Validating..." : "✓ Validate OTP"}
              </button>
              
              <button
                onClick={clearAll}
                className="px-6 py-3 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold transition-colors"
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
            <p className="mt-1">Ensure your Go backend is running with CORS enabled</p>
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
        }
        .otp-input:focus {
          transform: translateY(-5px) scale(1.06);
          box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.18), 0 0 0 6px rgba(99, 102, 241, 0.16);
          outline: none;
          border-color: #6366f1;
        }
        .otp-input:hover:not(:disabled) {
          transform: translateY(-2px) scale(1.03);
          box-shadow: 0 24px 40px -12px rgba(0, 0, 0, 0.12), 0 10px 18px -8px rgba(0, 0, 0, 0.05);
        }
        
        /* Ensure text is visible */
        .otp-input {
          text-align: center !important;
          vertical-align: middle;
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

        /* Add glow effect for focused inputs */
        .otp-input:focus {
          box-shadow: 
            0 30px 60px -20px rgba(0, 0, 0, 0.18),
            0 0 0 6px rgba(99, 102, 241, 0.16),
            0 0 40px rgba(99, 102, 241, 0.22);
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
          .otp-input {
            width: 5.25rem;
            height: 6rem;
            font-size: 3rem !important;
          }
        }
        @media (min-width: 769px) {
          .otp-input {
            width: 9rem;
            height: 10rem;
            font-size: 4rem !important;
          }
        }
      `}</style>
    </div>
  );
}
