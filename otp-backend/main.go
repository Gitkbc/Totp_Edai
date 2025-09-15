// filepath: /path/to/backend/main.go
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/pquerna/otp/totp"
)

var secret = "JBSWY3DPEHPK3PXP" // Example base32 secret

func getOTPHandler(w http.ResponseWriter, r *http.Request) {
	// Replace GenerateCode with GenerateCodeCustom to specify 4 digits
	otp, _ := totp.GenerateCodeCustom(secret, time.Now(), totp.ValidateOpts{
		Digits: 4,
		Period: 30,
	})
	json.NewEncoder(w).Encode(map[string]string{"otp": otp})
}

func validateOTPHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OTP string `json:"otp"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	// Use ValidateCustom instead of Validate to specify 4 digits
	valid, err := totp.ValidateCustom(req.OTP, secret, time.Now(), totp.ValidateOpts{
		Digits: 4,
		Period: 30,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]bool{"valid": valid})
}

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*") // Allow all origins
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/get-otp", getOTPHandler)
	mux.HandleFunc("/validate-otp", validateOTPHandler)

	log.Println("Running on :8080...")
	log.Fatal(http.ListenAndServe(":8080", enableCORS(mux)))
}
