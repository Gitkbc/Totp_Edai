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
    otp, _ := totp.GenerateCode(secret, time.Now())
    json.NewEncoder(w).Encode(map[string]string{"otp": otp})
}

func validateOTPHandler(w http.ResponseWriter, r *http.Request) {
    var req struct {
        OTP string `json:"otp"`
    }
    json.NewDecoder(r.Body).Decode(&req)
    valid := totp.Validate(req.OTP, secret)
    json.NewEncoder(w).Encode(map[string]bool{"valid": valid})
}

func main() {
    http.HandleFunc("/get-otp", getOTPHandler)
    http.HandleFunc("/validate-otp", validateOTPHandler)
    log.Println("Running on :8080...")
    log.Fatal(http.ListenAndServe(":8080", nil))
}