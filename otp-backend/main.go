package main

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Base32 alphabet for decoding
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

// Request and Response structures
type ValidateRequest struct {
	OTP string `json:"otp"`
}

type ValidateResponse struct {
	Valid   bool   `json:"valid"`
	Message string `json:"message"`
}

// TOTP configuration matching ESP8266 (4-digit)
const (
	BASE32_SECRET = "JBSWY3DPEHPK3PXP"
	TIME_STEP     = 30 // 30 seconds
	OTP_DIGITS    = 4  // Changed to 4 digits
	SKEW_TOLERANCE = 1 // Allow ±1 time window for clock drift
)

// decodeBase32 converts Base32 encoded string to bytes
func decodeBase32(encoded string) ([]byte, error) {
	encoded = strings.ToUpper(strings.TrimSpace(encoded))
	
	var result []byte
	var buffer uint32
	var bitsLeft int
	
	for _, char := range encoded {
		// Find character in alphabet
		value := -1
		for i, c := range base32Alphabet {
			if c == char {
				value = i
				break
			}
		}
		
		if value == -1 {
			continue // Skip invalid characters
		}
		
		buffer = (buffer << 5) | uint32(value)
		bitsLeft += 5
		
		if bitsLeft >= 8 {
			result = append(result, byte((buffer>>(bitsLeft-8))&0xFF))
			bitsLeft -= 8
		}
	}
	
	return result, nil
}

// generate4DigitTOTP generates a 4-digit TOTP code for the given time
func generate4DigitTOTP(secret []byte, timeCounter uint64) string {
	// Convert time counter to 8-byte big-endian
	timeBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(timeBytes, timeCounter)
	
	// Generate HMAC-SHA1
	mac := hmac.New(sha1.New, secret)
	mac.Write(timeBytes)
	hash := mac.Sum(nil)
	
	// Dynamic truncation
	offset := hash[len(hash)-1] & 0x0F
	truncatedHash := binary.BigEndian.Uint32(hash[offset:offset+4]) & 0x7FFFFFFF
	
	// Generate 6-digit OTP first, then convert to 4-digit
	sixDigitOTP := truncatedHash % 1000000 // 6 digits
	fourDigitOTP := sixDigitOTP % 10000    // Convert to 4 digits
	
	return fmt.Sprintf("%04d", fourDigitOTP)
}

// validate4DigitTOTP validates the provided 4-digit OTP against current time with tolerance
func validate4DigitTOTP(providedOTP string, secret []byte) bool {
	currentTime := time.Now().UTC().Unix()
	currentTimeCounter := uint64(currentTime) / TIME_STEP
	
	// Check current time window and ±SKEW_TOLERANCE windows
	for i := -SKEW_TOLERANCE; i <= SKEW_TOLERANCE; i++ {
		timeCounter := int64(currentTimeCounter) + int64(i)
		if timeCounter < 0 {
			continue
		}
		
		expectedOTP := generate4DigitTOTP(secret, uint64(timeCounter))
		if providedOTP == expectedOTP {
			if i != 0 {
				log.Printf("4-digit OTP validated with time skew: %d windows", i)
			}
			return true
		}
	}
	
	return false
}

// validateHandler handles the /validate endpoint
func validateHandler(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")
	
	// Handle preflight request
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	
	// Only allow POST requests
	if r.Method != "POST" {
		response := ValidateResponse{
			Valid:   false,
			Message: "Method not allowed. Use POST.",
		}
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(response)
		return
	}
	
	// Parse request body
	var req ValidateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response := ValidateResponse{
			Valid:   false,
			Message: "Invalid JSON format",
		}
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}
	
	// Validate OTP format (4 digits)
	if len(req.OTP) != OTP_DIGITS {
		response := ValidateResponse{
			Valid:   false,
			Message: fmt.Sprintf("OTP must be %d digits", OTP_DIGITS),
		}
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}
	
	// Check if OTP contains only digits
	if _, err := strconv.Atoi(req.OTP); err != nil {
		response := ValidateResponse{
			Valid:   false,
			Message: "OTP must contain only digits",
		}
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}
	
	// Decode secret
	secret, err := decodeBase32(BASE32_SECRET)
	if err != nil {
		log.Printf("Error decoding Base32 secret: %v", err)
		response := ValidateResponse{
			Valid:   false,
			Message: "Internal server error",
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}
	
	// Validate 4-digit TOTP
	isValid := validate4DigitTOTP(req.OTP, secret)
	
	var response ValidateResponse
	if isValid {
		response = ValidateResponse{
			Valid:   true,
			Message: "4-digit OTP is valid",
		}
		log.Printf("✅ Valid 4-digit OTP received: %s", req.OTP)
	} else {
		response = ValidateResponse{
			Valid:   false,
			Message: "Invalid 4-digit OTP",
		}
		log.Printf("❌ Invalid 4-digit OTP received: %s", req.OTP)
	}
	
	// Log current time information for debugging
	currentTime := time.Now().UTC()
	timeCounter := uint64(currentTime.Unix()) / TIME_STEP
	expectedOTP := generate4DigitTOTP(secret, timeCounter)
	log.Printf("🕐 Current UTC time: %s", currentTime.Format("2006-01-02 15:04:05"))
	log.Printf("🔢 Current time counter: %d", timeCounter)
	log.Printf("🔐 Expected 4-digit OTP for current window: %s", expectedOTP)
	
	json.NewEncoder(w).Encode(response)
}

// healthHandler provides a simple health check endpoint
func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	currentTime := time.Now().UTC()
	secret, _ := decodeBase32(BASE32_SECRET)
	timeCounter := uint64(currentTime.Unix()) / TIME_STEP
	currentOTP := generate4DigitTOTP(secret, timeCounter)
	
	response := map[string]interface{}{
		"status":           "healthy",
		"time":             currentTime.Format("2006-01-02 15:04:05 UTC"),
		"unix_time":        currentTime.Unix(),
		"time_window":      timeCounter,
		"current_4digit_otp": currentOTP,
		"otp_digits":       OTP_DIGITS,
	}
	
	json.NewEncoder(w).Encode(response)
}

func main() {
	// Test the Base32 decoding
	secret, err := decodeBase32(BASE32_SECRET)
	if err != nil {
		log.Fatalf("Failed to decode Base32 secret: %v", err)
	}
	
	log.Printf("🚀 Starting 4-Digit TOTP Validation Server...")
	log.Printf("🔑 Secret: %s", BASE32_SECRET)
	log.Printf("📏 Decoded secret length: %d bytes", len(secret))
	log.Printf("🔢 Decoded secret (hex): %x", secret)
	log.Printf("⏰ Time step: %d seconds", TIME_STEP)
	log.Printf("🎯 OTP digits: %d (4-DIGIT)", OTP_DIGITS)
	log.Printf("🔄 Skew tolerance: ±%d windows", SKEW_TOLERANCE)
	
	// Display current time and expected OTP
	currentTime := time.Now().UTC()
	timeCounter := uint64(currentTime.Unix()) / TIME_STEP
	currentOTP := generate4DigitTOTP(secret, timeCounter)
	
	log.Printf("\n📅 CURRENT TIME INFORMATION")
	log.Printf("====================================")
	log.Printf("🕐 UTC Time: %s", currentTime.Format("2006-01-02 15:04:05"))
	log.Printf("🌍 Unix timestamp: %d", currentTime.Unix())
	log.Printf("🔢 Time counter: %d", timeCounter)
	log.Printf("🔐 Current expected 4-digit OTP: %s", currentOTP)
	log.Printf("====================================")
	
	// Setup routes
	http.HandleFunc("/validate", validateHandler)
	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		response := map[string]string{
			"service": "4-Digit TOTP Validation API",
			"version": "1.0.0",
			"endpoints": "/validate (POST), /health (GET)",
			"otp_format": "4 digits",
		}
		json.NewEncoder(w).Encode(response)
	})
	
	// Start server
	port := "8080"
	log.Printf("🌐 Server starting on port %s", port)
	log.Printf("📡 Endpoints:")
	log.Printf("   POST /validate - Validate 4-digit TOTP")
	log.Printf("   GET  /health   - Health check with current 4-digit OTP")
	log.Printf("   GET  /         - Service info")
	log.Println("\n✅ 4-Digit TOTP Server ready!")
	
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}