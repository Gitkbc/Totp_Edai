#include <Wire.h>
#include <RTClib.h>
#include <TOTP.h>
#include <ESP8266WiFi.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <TM1637Display.h>

// -------------------------
// WiFi Credentials
// -------------------------
const char* ssid = "Wifi Name";
const char* password = "Wifi Password";

// -------------------------
#define buttonPin D3
#define ledPin    D4

#define CLK D5
#define DIO D6
TM1637Display display(CLK, DIO);

// RTC + NTP
RTC_DS3231 rtc;
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0);

// TOTP
const char* base32Secret = "JBSWY3DPEHPK3PXP";
uint8_t hmacKey[10];
TOTP totp(hmacKey, 10);
const char base32Alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// Globals
unsigned long lastButtonPress = 0;
unsigned long otpGeneratedTime = 0;
String currentOTP = "0000";
const unsigned long DEBOUNCE_DELAY = 500;
bool timeSetFromNTP = false;

// ------------------------------------------------------
// DISPLAY ANIMATIONS
// ------------------------------------------------------
void showLoad() {
  uint8_t loadData[] = {
    SEG_D | SEG_E | SEG_F,
    SEG_A | SEG_B | SEG_C | SEG_D | SEG_E | SEG_F,
    SEG_A | SEG_B | SEG_C | SEG_E | SEG_F | SEG_G,
    SEG_B | SEG_C | SEG_D | SEG_E | SEG_G
  };
  display.setSegments(loadData);
}

void showReady() {
  uint8_t data[] = {
    SEG_E | SEG_G,
    SEG_A | SEG_B | SEG_C | SEG_E | SEG_F | SEG_G,
    SEG_B | SEG_C | SEG_D | SEG_E | SEG_G,
    SEG_B | SEG_C | SEG_D | SEG_F | SEG_G
  };
  display.setSegments(data);
}

void showDashes() {
  uint8_t dashes[] = { SEG_G, SEG_G, SEG_G, SEG_G };
  display.setSegments(dashes);
}

// ------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(300);

  display.setBrightness(0x0f);
  display.clear();

  // Show LOAD animation
  showLoad();
  delay(2000);
  display.clear();

  Wire.begin(D2, D1);

  if (!rtc.begin()) {
    Serial.println("❌ RTC not detected!");
    while (1) delay(1000);
  }

  pinMode(buttonPin, INPUT_PULLUP);
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, HIGH);

  connectWiFiAndSyncTime();
  decodeBase32Secret();

  showReady();
  delay(1500);
  display.clear();

  Serial.println("🔥 Ready! Press the button to generate OTP.");
}

// ------------------------------------------------------
void loop() {
  timeClient.update();

  // Button
  if (digitalRead(buttonPin) == LOW && (millis() - lastButtonPress) > DEBOUNCE_DELAY) {
    lastButtonPress = millis();
    handleButtonPress();
  }

  updateDisplay();
  delay(80);
}

// ------------------------------------------------------
void connectWiFiAndSyncTime() {
  Serial.println("🌐 Connecting to WiFi...");
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(400);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n❌ WiFi Failed!");
    return;
  }

  Serial.println("\n✅ WiFi Connected!");

  timeClient.begin();
  Serial.println("⏳ Syncing time…");

  while (!timeClient.update()) {
    timeClient.forceUpdate();
  }

  unsigned long epoch = timeClient.getEpochTime();
  rtc.adjust(DateTime(epoch));
  timeSetFromNTP = true;

  Serial.print("⏰ RTC Synced: ");
  Serial.println(epoch);
}

// ------------------------------------------------------
void decodeBase32Secret() {
  int len = strlen(base32Secret);
  int buffer = 0, bitsLeft = 0, index = 0;

  for (int i = 0; i < len; i++) {
    char c = base32Secret[i];
    int v = -1;
    for (int j = 0; j < 32; j++) if (base32Alphabet[j] == c) v = j;
    if (v < 0) continue;

    buffer = (buffer << 5) | v;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      hmacKey[index++] = (buffer >> (bitsLeft - 8)) & 0xFF;
      bitsLeft -= 8;
    }
  }
}

// ------------------------------------------------------
void handleButtonPress() {
  digitalWrite(ledPin, LOW);
  delay(120);
  digitalWrite(ledPin, HIGH);

  generateOTP();
}

// ------------------------------------------------------
void generateOTP() {
  DateTime now = rtc.now();
  uint32_t unixTime = now.unixtime();

  Serial.println("\n🔐 Generating OTP...");
  Serial.print("RTC Unix: ");
  Serial.println(unixTime);

  String otp6 = totp.getCode(unixTime);
  uint32_t four = otp6.toInt() % 10000;

  String otp4 = String(four);
  while (otp4.length() < 4) otp4 = "0" + otp4;

  currentOTP = otp4;
  otpGeneratedTime = millis();

  Serial.print("✨ OTP = ");
  Serial.println(otp4);

  display.showNumberDec(otp4.toInt(), true);
}

// ------------------------------------------------------
void updateDisplay() {
  unsigned long elapsed = millis() - otpGeneratedTime;

  if (elapsed < 30000 && currentOTP != "0000") {
    display.showNumberDec(currentOTP.toInt(), true);
  } else {
    showDashes();
  }
}
