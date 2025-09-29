#include <Wire.h>
#include <RTClib.h>
#include <TOTP.h>
#include <ESP8266WiFi.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <TM1637Display.h>  // Library for 4-digit 7-segment display

// -------------------------
// WiFi Credentials
// -------------------------
const char* ssid = "Wifi Name";
const char* password = "Wifi Password";

// -------------------------
// Button & LED
// -------------------------
#define buttonPin D3   // GPIO0 (safe pin for button)
#define ledPin    D4   // GPIO2 (built-in LED)

// -------------------------
// 7-Segment Display Pins
// -------------------------
#define CLK D5         // Clock pin for TM1637
#define DIO D6         // Data pin for TM1637
TM1637Display display(CLK, DIO);

// -------------------------
// DS3231 RTC using RTClib
// -------------------------
RTC_DS3231 rtc;

// -------------------------
// NTP Client for time sync
// -------------------------
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 60000); // UTC timezone, update every 60s

// -------------------------
// TOTP Configuration (4-digit)
// -------------------------
const char* base32Secret = "JBSWY3DPEHPK3PXP";   // Must match backend
uint8_t hmacKey[10];                            // Decoded secret (80 bits = 10 bytes)
TOTP totp(hmacKey, 10);

const char base32Alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// -------------------------
// Global Variables
// -------------------------
unsigned long lastButtonPress = 0;
const unsigned long DEBOUNCE_DELAY = 500;
bool timeSetFromNTP = false;
String currentOTP = "0000";  // Store current OTP for display
unsigned long otpGeneratedTime = 0;  // Track when OTP was generated

// =====================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("🚀 Starting ESP8266 4-Digit TOTP Generator with Display...");

  // Initialize 7-segment display
  display.setBrightness(0x0f); // Set brightness (0x00 to 0x0f)
  display.clear();
  
  // Show "LOAD" during initialization
  uint8_t loadData[] = {
    SEG_D | SEG_E | SEG_F,                    // L
    SEG_A | SEG_B | SEG_C | SEG_D | SEG_E | SEG_F, // O
    SEG_A | SEG_B | SEG_C | SEG_E | SEG_F | SEG_G,  // A
    SEG_B | SEG_C | SEG_D | SEG_E | SEG_G           // d
  };
  display.setSegments(loadData);
  delay(2000);

  // Initialize I2C for RTC
  Wire.begin(D2, D1);  // SDA=D2, SCL=D1

  // Initialize RTC
  if (!rtc.begin()) {
    Serial.println("❌ Couldn't find RTC");
    // Show "ERR" on display
    showError();
    while (1) {
      delay(1000);
    }
  }

  // Initialize GPIO
  pinMode(buttonPin, INPUT_PULLUP);
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, HIGH); // Turn off LED (inverted)

  // Connect to WiFi and sync time
  connectWiFiAndSyncTime();

  // Decode Base32 secret
  decodeBase32Secret();

  Serial.println("✅ 4-Digit TOTP Generator Ready!");
  Serial.println("📱 Press button to generate 4-digit OTP");
  displayCurrentTime();
  
  // Show "READY" on display
  showReady();
  delay(2000);
  
  // Clear display initially
  display.clear();
}

// =====================================================
void loop() {
  // Keep NTP client updated
  timeClient.update();
  
  // Check button press
  if (digitalRead(buttonPin) == LOW && (millis() - lastButtonPress) > DEBOUNCE_DELAY) {
    lastButtonPress = millis();
    handleButtonPress();
  }
  
  // Update display with current OTP and countdown
  updateDisplay();

  delay(100);
}

// =====================================================
// WiFi Connection and Time Sync
// =====================================================
void connectWiFiAndSyncTime() {
  Serial.println("🌐 Connecting to WiFi...");
  
  // Show "WiFi" on display
  showWiFiConnecting();
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("✅ WiFi connected!");
    Serial.print("📡 IP address: ");
    Serial.println(WiFi.localIP());
    
    // Show "SYNC" on display
    showSyncing();
    
    // Initialize and start NTP client
    timeClient.begin();
    timeClient.update();
    
    // Sync RTC with NTP time
    syncRTCWithNTP();
  } else {
    Serial.println("");
    Serial.println("❌ WiFi connection failed! Using manual time...");
    // Fallback to manual time setting
    if (rtc.lostPower()) {
      Serial.println("⚠️  RTC lost power, setting time manually!");
      // Set to current UTC time (update manually to match your backend!)
      rtc.adjust(DateTime(2025, 9, 20, 19, 30, 16));  // UPDATED TIME
      Serial.println("✅ RTC time has been set manually.");
    }
  }
}

// =====================================================
// Sync RTC with NTP
// =====================================================
void syncRTCWithNTP() {
  if (timeClient.isTimeSet()) {
    unsigned long epochTime = timeClient.getEpochTime();
    
    // Convert epoch to DateTime
    DateTime ntpTime = DateTime(epochTime);
    
    // Set RTC to NTP time
    rtc.adjust(ntpTime);
    
    Serial.println("⏰ RTC synchronized with NTP server!");
    Serial.print("🌍 NTP Unix timestamp: ");
    Serial.println(epochTime);
    
    timeSetFromNTP = true;
  } else {
    Serial.println("❌ Failed to get time from NTP server");
    // Fallback to manual time
    if (rtc.lostPower()) {
      rtc.adjust(DateTime(2025, 9, 28, 2, 25, 16));  // UPDATED TIME
      Serial.println("⚠️  Using manual time as fallback");
    }
  }
}

// =====================================================
// Handle Button Press
// =====================================================
void handleButtonPress() {
  Serial.println("\n🔘 Button pressed! Generating 4-digit OTP...");
  
  // LED feedback
  digitalWrite(ledPin, LOW);  // Turn on LED
  delay(200);
  digitalWrite(ledPin, HIGH); // Turn off LED
  
  generateAndPrint4DigitOTP();
}

// =====================================================
// Decode Base32 Secret
// =====================================================
void decodeBase32Secret() {
  int decodedLength = manualBase32Decode(base32Secret, hmacKey);

  Serial.println("\n🔑 4-Digit TOTP Configuration:");
  Serial.print("📝 Secret: ");
  Serial.println(base32Secret);
  Serial.print("📏 Decoded length: ");
  Serial.println(decodedLength);
  Serial.print("🔢 Decoded secret (hex): ");
  for (int i = 0; i < decodedLength; i++) {
    if (hmacKey[i] < 16) Serial.print("0");
    Serial.print(hmacKey[i], HEX);
  }
  Serial.println();
}

int manualBase32Decode(const char* encoded, uint8_t* result) {
  int len = strlen(encoded);
  int resultIndex = 0;
  int buffer = 0;
  int bitsLeft = 0;

  for (int i = 0; i < len; i++) {
    char c = encoded[i];
    int value = -1;

    for (int j = 0; j < 32; j++) {
      if (base32Alphabet[j] == c) {
        value = j;
        break;
      }
    }

    if (value == -1) continue;

    buffer = (buffer << 5) | value;
    bitsLeft += 5;

    if (bitsLeft >= 8) {
      result[resultIndex++] = (buffer >> (bitsLeft - 8)) & 0xFF;
      bitsLeft -= 8;
    }
  }

  return resultIndex;
}

// =====================================================
// Generate and Print 4-Digit OTP
// =====================================================
void generateAndPrint4DigitOTP() {
  DateTime now = rtc.now();
  uint32_t unixTime = now.unixtime();  // UTC

  Serial.println("\n====================================");
  Serial.println("🔢 GENERATING 4-DIGIT TOTP");
  Serial.println("====================================");
  Serial.print("⏰ Current Unix time (UTC): ");
  Serial.println(unixTime);
  
  if (timeSetFromNTP) {
    Serial.println("✅ Time synced via NTP");
  } else {
    Serial.println("⚠️  Using manual time - may need adjustment");
  }

  // Generate 6-digit OTP first
  String fullOtpCode = totp.getCode(unixTime);
  
  // Convert to 4-digit by taking modulo 10000
  uint32_t fullOtp = fullOtpCode.toInt();
  uint32_t fourDigitOtp = fullOtp % 10000;
  
  // Format as 4-digit string with leading zeros
  String otpCode = String(fourDigitOtp);
  while (otpCode.length() < 4) {
    otpCode = "0" + otpCode;
  }

  // Store current OTP and generation time
  currentOTP = otpCode;
  otpGeneratedTime = millis();

  // Print OTP
  Serial.print("🔐 Generated OTP (4-digit): ");
  Serial.println(otpCode);

  // Validity
  int secondsUntilNext = 30 - (unixTime % 30);
  Serial.print("⏳ Valid for: ");
  Serial.print(secondsUntilNext);
  Serial.println(" seconds");
  Serial.println("====================================\n");
  
  // Display OTP on 7-segment display
  displayOTP(otpCode);
}

// =====================================================
// Display Current Time (Serial Debug)
// =====================================================
void displayCurrentTime() {
  DateTime now = rtc.now();
  Serial.println("\n📅 CURRENT TIME INFORMATION");
  Serial.println("====================================");
  Serial.print("🕐 UTC Time: ");
  Serial.print(now.year()); Serial.print("-");
  if (now.month() < 10) Serial.print("0");
  Serial.print(now.month()); Serial.print("-");
  if (now.day() < 10) Serial.print("0");
  Serial.print(now.day()); Serial.print(" ");
  if (now.hour() < 10) Serial.print("0");
  Serial.print(now.hour()); Serial.print(":");
  if (now.minute() < 10) Serial.print("0");
  Serial.print(now.minute()); Serial.print(":");
  if (now.second() < 10) Serial.print("0");
  Serial.println(now.second());

  Serial.print("🌍 Unix timestamp: ");
  Serial.println(now.unixtime());
  
  if (timeSetFromNTP) {
    Serial.println("🌐 Time source: NTP Server");
  } else {
    Serial.println("⚠️  Time source: Manual/Fallback");
  }
  Serial.println("====================================\n");
}

// =====================================================
// Display Functions for 7-Segment
// =====================================================
void displayOTP(String otp) {
  // Convert string to integer and display
  int otpNumber = otp.toInt();
  display.showNumberDec(otpNumber, true); // true = show leading zeros
}

void updateDisplay() {
  if (currentOTP != "0000" && (millis() - otpGeneratedTime) < 30000) {
    // Show OTP for 30 seconds after generation
    displayOTP(currentOTP);
    
    // Blink colon to show countdown (optional visual indicator)
    DateTime now = rtc.now();
    int secondsUntilNext = 30 - (now.unixtime() % 30);
    
    // Optional: Blink display when OTP is about to expire (last 5 seconds)
    if (secondsUntilNext <= 5) {
      if ((millis() / 500) % 2 == 0) {
        display.clear();
      } else {
        displayOTP(currentOTP);
      }
    }
  } else {
    // Show dashes when no OTP is displayed
    display.clear();
    uint8_t dashData[] = {SEG_G, SEG_G, SEG_G, SEG_G}; // Four dashes
    display.setSegments(dashData);
  }
}

void showError() {
  uint8_t errorData[] = {
    SEG_A | SEG_D | SEG_E | SEG_F | SEG_G,           // E
    SEG_E | SEG_G,                                   // r
    SEG_E | SEG_G,                                   // r
    0x00                                             // (blank)
  };
  display.setSegments(errorData);
}

void showReady() {
  uint8_t readyData[] = {
    SEG_E | SEG_G,                                   // r
    SEG_A | SEG_B | SEG_C | SEG_E | SEG_F | SEG_G,   // A
    SEG_B | SEG_C | SEG_D | SEG_E | SEG_G,           // d
    SEG_B | SEG_C | SEG_D | SEG_F | SEG_G            // y
  };
  display.setSegments(readyData);
}

void showWiFiConnecting() {
  uint8_t wifiData[] = {
    SEG_B | SEG_C | SEG_D | SEG_E | SEG_F,           // U (representing WiFi)
    SEG_A | SEG_E | SEG_F,                           // F
    SEG_E | SEG_F,                                   // I
    SEG_E | SEG_F                                    // I
  };
  display.setSegments(wifiData);
}

void showSyncing() {
  uint8_t syncData[] = {
    SEG_A | SEG_C | SEG_D | SEG_F | SEG_G,           // S
    SEG_B | SEG_C | SEG_D | SEG_F | SEG_G,           // y
    SEG_C | SEG_E | SEG_G,                           // n
    SEG_A | SEG_D | SEG_E | SEG_F                    // C
  };
  display.setSegments(syncData);
}
