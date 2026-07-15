#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include "DHT.h"
#include <time.h>

// ======================================================
// 1) WIFI WOKWI
// ======================================================
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""

// ======================================================
// 2) FIREBASE - GIỮ DATABASE CŨ CỦA SMART CITY
// ======================================================
#define API_KEY "AIzaSyCRe29okSWdIme1R601leliJhXQ0a3ZPPU"
#define DATABASE_URL "project1-2d577-default-rtdb.asia-southeast1.firebasedatabase.app"

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// ======================================================
// 3) CHỌN KHU VỰC - GIỮ CẤU TRÚC smartCity/<region>
// ======================================================
#define REGION "quan1"

// ======================================================
// 4) ĐỊNH NGHĨA CHÂN CẮM
// ======================================================
#define DHTPIN 15
#define DHTTYPE DHT22

#define PIN_RAIN 34
#define PIN_AQI 35

#define PIN_STREET 21
#define PIN_FAN 23
#define PIN_PUMP 22

DHT dht(DHTPIN, DHTTYPE);

// ======================================================
// 5) TIMER
// ======================================================
unsigned long sendDataPrevMillis = 0;
unsigned long readDataPrevMillis = 0;
unsigned long wifiCheckPrevMillis = 0;

const unsigned long READ_DEVICE_INTERVAL = 250;
const unsigned long SEND_SENSOR_INTERVAL = 2000;
const unsigned long WIFI_CHECK_INTERVAL = 3000;

// ======================================================
// 6) BIẾN TRẠNG THÁI
// ======================================================
bool fanState = false;
bool pumpState = false;
bool streetLightState = false;

int fanLevel = 0;   // 0..100
int pumpLevel = 0;  // 0..100

// ======================================================
// 7) PWM CONFIG
// ======================================================
const int FAN_CHANNEL = 0;
const int PUMP_CHANNEL = 1;
const int PWM_FREQ = 5000;
const int PWM_RESOLUTION = 8; // 0..255

// ======================================================
// 8) HÀM HỖ TRỢ
// ======================================================
String pathOf(const String &suffix) {
  return String("smartCity/") + REGION + "/" + suffix;
}

String nowString() {
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    char buf[25];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
    return String(buf);
  }

  unsigned long sec = millis() / 1000;
  unsigned long hh = (sec / 3600) % 24;
  unsigned long mm = (sec / 60) % 60;
  unsigned long ss = sec % 60;

  char buf[25];
  snprintf(buf, sizeof(buf), "2026-03-26 %02lu:%02lu:%02lu", hh, mm, ss);
  return String(buf);
}

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Dang ket noi WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(300);
  }

  Serial.println();
  Serial.println("Da ket noi WiFi!");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println("WiFi bi mat, dang noi lai...");
  WiFi.disconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 6000) {
    Serial.print(".");
    delay(300);
  }

  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Da noi lai WiFi!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Noi lai WiFi that bai!");
  }
}

void initTime() {
  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  Serial.println("Dang dong bo NTP...");
}

int clampPercent(int value) {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

void applyOutputs() {
  // Đèn đường chỉ cần ON/OFF
  digitalWrite(PIN_STREET, streetLightState ? HIGH : LOW);

  // Quạt và bơm mô phỏng bằng PWM theo slider
  int fanDuty = fanState ? map(fanLevel, 0, 100, 0, 255) : 0;
  int pumpDuty = pumpState ? map(pumpLevel, 0, 100, 0, 255) : 0;

  ledcWrite(FAN_CHANNEL, fanDuty);
  ledcWrite(PUMP_CHANNEL, pumpDuty);
}

void printDeviceStateIfChanged(
  bool oldFan, bool oldPump, bool oldStreet,
  int oldFanLevel, int oldPumpLevel
) {
  if (oldFan != fanState ||
      oldPump != pumpState ||
      oldStreet != streetLightState ||
      oldFanLevel != fanLevel ||
      oldPumpLevel != pumpLevel) {
    Serial.printf(
      "Nhan lenh -> fan: %s (%d%%), pump: %s (%d%%), streetLight: %s\n",
      fanState ? "ON" : "OFF",
      fanLevel,
      pumpState ? "ON" : "OFF",
      pumpLevel,
      streetLightState ? "ON" : "OFF"
    );
  }
}

// ======================================================
// 9) SETUP
// ======================================================
void setup() {
  Serial.begin(115200);

  pinMode(PIN_STREET, OUTPUT);
  digitalWrite(PIN_STREET, LOW);

  dht.begin();

  // PWM cho quạt và bơm
  ledcSetup(FAN_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(PIN_FAN, FAN_CHANNEL);

  ledcSetup(PUMP_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(PIN_PUMP, PUMP_CHANNEL);

  ledcWrite(FAN_CHANNEL, 0);
  ledcWrite(PUMP_CHANNEL, 0);

  connectWiFi();
  initTime();

  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  config.signer.test_mode = true;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  Serial.println("Da ket noi Firebase!");
}

// ======================================================
// 10) LOOP
// ======================================================
void loop() {
  // ------------------------------------------------------
  // NHIỆM VỤ 0: Kiểm tra WiFi
  // ------------------------------------------------------
  if (millis() - wifiCheckPrevMillis >= WIFI_CHECK_INTERVAL || wifiCheckPrevMillis == 0) {
    wifiCheckPrevMillis = millis();
    ensureWiFi();
  }

  // ------------------------------------------------------
  // NHIỆM VỤ 1: NHẬN LỆNH TỪ WEB XUỐNG ESP32
  // ------------------------------------------------------
  if (millis() - readDataPrevMillis >= READ_DEVICE_INTERVAL || readDataPrevMillis == 0) {
    readDataPrevMillis = millis();

    bool oldFan = fanState;
    bool oldPump = pumpState;
    bool oldStreet = streetLightState;
    int oldFanLevel = fanLevel;
    int oldPumpLevel = pumpLevel;

    // fan ON/OFF
    if (Firebase.RTDB.getBool(&fbdo, pathOf("devices/fan"))) {
      fanState = fbdo.boolData();
    } else {
      Serial.print("Loi doc fan: ");
      Serial.println(fbdo.errorReason());
    }

    // pump ON/OFF
    if (Firebase.RTDB.getBool(&fbdo, pathOf("devices/pump"))) {
      pumpState = fbdo.boolData();
    } else {
      Serial.print("Loi doc pump: ");
      Serial.println(fbdo.errorReason());
    }

    // streetLight ON/OFF
    if (Firebase.RTDB.getBool(&fbdo, pathOf("devices/streetLight"))) {
      streetLightState = fbdo.boolData();
    } else {
      Serial.print("Loi doc streetLight: ");
      Serial.println(fbdo.errorReason());
    }

    // fanLevel 0..100
    if (Firebase.RTDB.getInt(&fbdo, pathOf("devices/fanLevel"))) {
      fanLevel = clampPercent(fbdo.intData());
    } else {
      Serial.print("Loi doc fanLevel: ");
      Serial.println(fbdo.errorReason());
    }

    // pumpLevel 0..100
    if (Firebase.RTDB.getInt(&fbdo, pathOf("devices/pumpLevel"))) {
      pumpLevel = clampPercent(fbdo.intData());
    } else {
      Serial.print("Loi doc pumpLevel: ");
      Serial.println(fbdo.errorReason());
    }

    applyOutputs();
    printDeviceStateIfChanged(oldFan, oldPump, oldStreet, oldFanLevel, oldPumpLevel);
  }

  // ------------------------------------------------------
  // NHIỆM VỤ 2: GỬI DỮ LIỆU CẢM BIẾN LÊN WEB
  // ------------------------------------------------------
  if (millis() - sendDataPrevMillis >= SEND_SENSOR_INTERVAL || sendDataPrevMillis == 0) {
    sendDataPrevMillis = millis();

    float t = dht.readTemperature();
    float h = dht.readHumidity();

    int rawRain = analogRead(PIN_RAIN);
    int rainfall = map(rawRain, 0, 4095, 0, 150);

    int rawAQI = analogRead(PIN_AQI);
    int aqi = map(rawAQI, 0, 4095, 0, 500);

    if (!isnan(t) && !isnan(h)) {
      bool ok1 = Firebase.RTDB.setFloat(&fbdo, pathOf("sensors/temperature"), t);
      bool ok2 = Firebase.RTDB.setFloat(&fbdo, pathOf("sensors/humidity"), h);
      bool ok3 = Firebase.RTDB.setInt(&fbdo, pathOf("sensors/rainfall"), rainfall);
      bool ok4 = Firebase.RTDB.setInt(&fbdo, pathOf("sensors/aqi"), aqi);
      bool ok5 = Firebase.RTDB.setString(&fbdo, pathOf("sensors/updatedAt"), nowString());

      if (ok1 && ok2 && ok3 && ok4 && ok5) {
        Serial.printf(
          "Gui len Firebase -> T: %.1f C, H: %.1f %%, Rain: %d mm, AQI: %d\n",
          t, h, rainfall, aqi
        );
      } else {
        Serial.print("Loi gui sensors: ");
        Serial.println(fbdo.errorReason());
      }
    } else {
      Serial.println("Loi: Khong doc duoc DHT22!");
    }
  }
}