import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  onValue,
  ref,
  update,
  get
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCRe29okSWdIme1R601leliJhXQ0a3ZPPU",
  authDomain: "project1-2d577.firebaseapp.com",
  databaseURL: "https://project1-2d577-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "project1-2d577",
  storageBucket: "project1-2d577.firebasestorage.app",
  messagingSenderId: "109624586062",
  appId: "1:109624586062:web:5ba720d04765a85ce8f81f",
  measurementId: "G-R2C6XWQHZ8"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const regionNames = {
  quan1: "Quận 1",
  quan3: "Quận 3",
  quan7: "Quận 7",
  thuduc: "Thủ Đức"
};

// --- TRUY XUẤT CÁC THÀNH PHẦN GIAO DIỆN (DOM ELEMENTS) ---
const regionSelect = document.getElementById("regionSelect");
const regionTitle = document.getElementById("regionTitle");
const lastUpdated = document.getElementById("lastUpdated");
const dbStatus = document.getElementById("dbStatus");
const dbDot = document.getElementById("dbDot");
const refreshBtn = document.getElementById("refreshBtn");
const summaryBox = document.getElementById("summaryBox");
const heatLevel = document.getElementById("heatLevel");
const floodRisk = document.getElementById("floodRisk");
const airLevel = document.getElementById("airLevel");

// Các phần tử điều khiển Quạt và Bơm
const fanLevelSlider = document.getElementById("fanLevel");
const pumpLevelSlider = document.getElementById("pumpLevel");
const fanLevelValue = document.getElementById("fanLevelValue");
const pumpLevelValue = document.getElementById("pumpLevelValue");
const fanInlineStatus = document.getElementById("fanInlineStatus");
const pumpInlineStatus = document.getElementById("pumpInlineStatus");
const fanProgress = document.getElementById("fanProgress");
const pumpProgress = document.getElementById("pumpProgress");
const fanStateChip = document.getElementById("fanStateChip");
const pumpStateChip = document.getElementById("pumpStateChip");
const streetStateChip = document.getElementById("streetStateChip");
const fanQuickStatus = document.getElementById("fanQuickStatus");
const pumpQuickStatus = document.getElementById("pumpQuickStatus");
const streetQuickStatus = document.getElementById("streetQuickStatus");

// Quản lý các đối tượng biểu đồ (Chart.js)
let charts = { temperature: null, humidity: null, rainfall: null, aqi: null };

// Lưu trữ lịch sử dữ liệu để vẽ biểu đồ cho từng khu vực
let regionalHistory = {
  quan1: { labels: [], temperature: [], humidity: [], rainfall: [], aqi: [] },
  quan3: { labels: [], temperature: [], humidity: [], rainfall: [], aqi: [] },
  quan7: { labels: [], temperature: [], humidity: [], rainfall: [], aqi: [] },
  thuduc: { labels: [], temperature: [], humidity: [], rainfall: [], aqi: [] }
};
const MAX_DATA_POINTS = 20;

// Nhóm các phần tử hiển thị giá trị cảm biến
const ui = {
  temperatureValue: document.getElementById("temperatureValue"),
  humidityValue: document.getElementById("humidityValue"),
  waterLevelValue: document.getElementById("waterLevelValue"),
  aqiValue: document.getElementById("aqiValue"),
  temperatureStatus: document.getElementById("temperatureStatus"),
  humidityStatus: document.getElementById("humidityStatus"),
  waterLevelStatus: document.getElementById("waterLevelStatus"),
  aqiStatus: document.getElementById("aqiStatus")
};

// Nhóm các nút điều khiển thiết bị
const deviceButtons = {
  fan: document.getElementById("fanBtn"),
  pump: document.getElementById("pumpBtn"),
  streetLight: document.getElementById("lightBtn")
};

// Biến trạng thái hiện tại
let currentRegion = regionSelect.value;
let regionUnsubscribe = null;
let sliderUpdateTimers = { fanLevel: null, pumpLevel: null };
let suppressSliderSync = { fanLevel: false, pumpLevel: false };

// Định dạng số và đơn vị hiển thị
function formatNumber(value, suffix = "") {
  return value === undefined || value === null || value === "" ? `--${suffix}` : `${value}${suffix}`;
}

// Cập nhật trạng thái kết nối Database trên UI
function setConnectionStatus(online, message) {
  dbStatus.textContent = message;
  dbDot.classList.remove("online", "offline");
  dbDot.classList.add(online ? "online" : "offline");
}

// Cập nhật trạng thái các Chip hiển thị ON/OFF
function setChipState(element, active, activeText = "Bật", inactiveText = "Tắt") {
  element.textContent = active ? activeText : inactiveText;
  element.classList.toggle("active", active);
}

// Cập nhật thanh tiến trình (ProgressBar)
function setProgress(element, value) {
  if (!element) return;
  element.style.width = `${Math.max(0, Math.min(100, Number(value) || 0))}%`;
}

// Các hàm đánh giá ngưỡng dữ liệu cảm biến
function getTemperatureStatus(value) {
  if (value === undefined || value === null) return "Chưa có dữ liệu nhiệt độ";
  if (value >= 36) return "Nhiệt độ rất cao, cần cảnh báo nóng";
  if (value >= 31) return "Nhiệt độ cao";
  if (value >= 25) return "Nhiệt độ bình thường";
  return "Thời tiết mát";
}

function getHumidityStatus(value) {
  if (value === undefined || value === null) return "Chưa có dữ liệu độ ẩm";
  if (value >= 85) return "Độ ẩm rất cao";
  if (value >= 65) return "Độ ẩm ổn định";
  return "Không khí khá khô";
}

function getWaterLevelStatus(value) {
  if (value === undefined || value === null) return "Chưa có dữ liệu mực nước";
  if (value >= 60) return "Mực nước rất cao, nguy cơ ngập";
  if (value >= 20) return "Mực nước đang dâng trung bình";
  if (value > 0) return "Có nước đọng nhẹ";
  return "Khô ráo";
}

function getAQIStatus(value) {
  if (value === undefined || value === null) return "Chưa có dữ liệu AQI";
  if (value > 150) return "Không khí xấu";
  if (value > 100) return "Không khí kém";
  if (value > 50) return "Không khí trung bình";
  return "Không khí tốt";
}

// Tạo văn bản tóm tắt tình trạng khu vực dựa trên dữ liệu hiện tại
function buildSummary(sensorData = {}, devices = {}) {
  const { temperature, humidity, rainfall, aqi } = sensorData;
  const fanLevel = Number(devices.fanLevel ?? 0);
  const pumpLevel = Number(devices.pumpLevel ?? 0);

  const heatText = temperature >= 36 ? "Rất cao" : temperature >= 31 ? "Cao" : temperature >= 25 ? "Ổn định" : "Mát";
  const floodText = rainfall >= 60 ? "Cao" : rainfall >= 20 ? "Trung bình" : "Thấp";
  const airText = aqi > 150 ? "Xấu" : aqi > 100 ? "Kém" : aqi > 50 ? "Trung bình" : "Tốt";

  heatLevel.textContent = heatText;
  floodRisk.textContent = floodText;
  airLevel.textContent = airText;

  summaryBox.textContent =
    `Khu vực ${regionNames[currentRegion]} hiện có nhiệt độ ${formatNumber(temperature, "°C")}, ` +
    `độ ẩm ${formatNumber(humidity, "%")}, mực nước ${formatNumber(rainfall, " mm")} và AQI ${formatNumber(aqi)}. ` +
    `Quạt ${devices.fan ? `đang bật ở mức ${fanLevel}%` : "đang tắt"}, ` +
    `bơm ${devices.pump ? `đang bật ở mức ${pumpLevel}%` : "đang tắt"}, ` +
    `đèn đường ${devices.streetLight ? "đang bật" : "đang tắt"}.`;
}

// Cập nhật trạng thái hiển thị của các thiết bị (Nút bấm, Slider)
function renderDevices(devices = {}) {
  // ===== BUTTON =====
  Object.entries(deviceButtons).forEach(([key, button]) => {
    const isActive = !!devices[key];
    button.textContent = isActive ? "ON" : "OFF";
    button.classList.toggle("active", isActive);
  });

  /// Cập nhật giá trị thanh trượt (Slider)
  const fanLevel = Number(devices.fanLevel ?? 0);
  const pumpLevel = Number(devices.pumpLevel ?? 0);

  // ===== FIX QUAN TRỌNG =====
  const fanState = !!devices.fan;
  const pumpState = !!devices.pump;

  if (!suppressSliderSync.fanLevel) {
    fanLevelSlider.value = fanLevel;
    fanLevelValue.textContent = fanLevel + "%";
    setProgress(fanProgress, fanLevel);
    if (fanQuickStatus) fanQuickStatus.textContent = `${fanLevel}%`;
    fanInlineStatus.textContent = fanState
      ? `Quạt đang chạy (${fanLevel}%)`
      : `Quạt đang tắt`;
  }

  if (!suppressSliderSync.pumpLevel) {
    pumpLevelSlider.value = pumpLevel;
    pumpLevelValue.textContent = pumpLevel + "%";
    setProgress(pumpProgress, pumpLevel);
    if (pumpQuickStatus) pumpQuickStatus.textContent = `${pumpLevel}%`;
    pumpInlineStatus.textContent = pumpState
      ? `Bơm đang chạy (${pumpLevel}%)`
      : `Bơm đang tắt`;
  }
}

// Hiển thị dữ liệu cảm biến lên màn hình
function renderSensorData(sensorData = {}, devices = {}) {
  ui.temperatureValue.textContent = formatNumber(sensorData.temperature, "°C");
  ui.humidityValue.textContent = formatNumber(sensorData.humidity, "%");
  ui.waterLevelValue.textContent = formatNumber(sensorData.rainfall, "mm");
  ui.aqiValue.textContent = formatNumber(sensorData.aqi);

  ui.temperatureStatus.textContent = getTemperatureStatus(sensorData.temperature);
  ui.humidityStatus.textContent = getHumidityStatus(sensorData.humidity);
  ui.waterLevelStatus.textContent = getWaterLevelStatus(sensorData.rainfall);
  ui.aqiStatus.textContent = getAQIStatus(sensorData.aqi);

  //lastUpdated.textContent = `Cập nhật: ${sensorData.updatedAt || "--"}`;
  buildSummary(sensorData, devices);
  renderDevices(devices);
}

// Khởi tạo các biểu đồ đường
function initCharts() {
  if (typeof Chart === "undefined") return;
  Chart.defaults.color = "#9db0d0";
  Chart.defaults.font.family = "'Inter', sans-serif";

  const makeChart = (canvasId, label, color, unit, key) => {
    const ctx = document.getElementById(canvasId).getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, color.replace("1)", "0.25)"));
    gradient.addColorStop(1, color.replace("1)", "0.02)"));

    return new Chart(ctx, {
      type: "line",
      data: {
        labels: regionalHistory[currentRegion].labels,
        datasets: [{
          label: `${label} (${unit})`,
          data: regionalHistory[currentRegion][key],
          borderColor: color,
          backgroundColor: gradient,
          borderWidth: 2.2,
          fill: true,
          tension: 0.35,
          pointRadius: 2.5,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#121b2d",
            titleColor: "#ecf3ff",
            bodyColor: "#ecf3ff",
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: 1,
            displayColors: false,
            callbacks: { label: (context) => ` ${context.parsed.y} ${unit}` }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }
          },
          y: {
            grid: { color: "rgba(255,255,255,0.05)" }
          }
        }
      }
    });
  };

  charts.temperature = makeChart("tempChart", "Nhiệt độ", "rgba(255,107,107,1)", "°C", "temperature");
  charts.humidity = makeChart("humChart", "Độ ẩm", "rgba(69,163,255,1)", "%", "humidity");
  charts.rainfall = makeChart("waterChart", "Mực nước", "rgba(53,195,143,1)", "mm", "rainfall");
  charts.aqi = makeChart("aqiChart", "AQI", "rgba(165,114,255,1)", "", "aqi");
}

// Cập nhật dữ liệu mới vào biểu đồ
function updateChartsData(sensorData) {
  const now = new Date();
  const label = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

  const history = regionalHistory[currentRegion];
  history.labels.push(label);
  history.temperature.push(sensorData.temperature);
  history.humidity.push(sensorData.humidity);
  history.rainfall.push(sensorData.rainfall);
  history.aqi.push(sensorData.aqi);

  // Xóa điểm cũ nếu vượt quá giới hạn
  if (history.labels.length > MAX_DATA_POINTS) {
    history.labels.shift();
    history.temperature.shift();
    history.humidity.shift();
    history.rainfall.shift();
    history.aqi.shift();
  }

  // Vẽ lại các biểu đồ
  if (charts.temperature) {
    Object.keys(charts).forEach((key) => {
      charts[key].data.labels = history.labels;
      charts[key].data.datasets[0].data = history[key];
      charts[key].update("none");
    });
  }
}

// Xóa trắng lịch sử biểu đồ (khi đổi khu vực)
function clearChartHistory() {
  if (!charts.temperature) return;
  const history = regionalHistory[currentRegion];
  Object.keys(charts).forEach((key) => {
    charts[key].data.labels = history.labels;
    charts[key].data.datasets[0].data = history[key];
    charts[key].update("none");
  });
}

// --- LOGIC KẾT NỐI REALTIME DATABASE ---
// Lắng nghe dữ liệu theo khu vực được chọn
function listenRegion(regionKey) {
  currentRegion = regionKey;
  regionTitle.textContent = `Khu vực: ${regionNames[regionKey] || regionKey}`;
  clearChartHistory();

  const regionRef = ref(db, `smartCity/${regionKey}`);

  // Hủy lắng nghe dữ liệu cũ trước khi tạo kết nối mới
  if (typeof regionUnsubscribe === "function") regionUnsubscribe();

  regionUnsubscribe = onValue(
    regionRef,
    (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setConnectionStatus(false, "Không tìm thấy dữ liệu khu vực");
        renderSensorData({}, {});
        return;
      }

      const sensorData = data.sensors || {};
      const devices = {
        fan: !!data.devices?.fan,
        pump: !!data.devices?.pump,
        streetLight: !!data.devices?.streetLight,
        fanLevel: Number(data.devices?.fanLevel ?? 0),
        pumpLevel: Number(data.devices?.pumpLevel ?? 0)
      };

      setConnectionStatus(true, "Kết nối database thành công");
      renderSensorData(sensorData, devices);
      updateChartsData(sensorData);
    },
    (error) => {
      console.error("Realtime DB error:", error);
      setConnectionStatus(false, "Lỗi kết nối database");
    }
  );
}

// Đổi trạng thái thiết bị (ON <-> OFF)
async function toggleDevice(deviceName) {
  try {
    const deviceRef = ref(db, `smartCity/${currentRegion}/devices/${deviceName}`);
    const snapshot = await get(deviceRef);
    const currentValue = !!snapshot.val();
    await update(ref(db, `smartCity/${currentRegion}/devices`), { [deviceName]: !currentValue });
  } catch (error) {
    console.error(`Không thể cập nhật ${deviceName}:`, error);
    alert(`Không thể cập nhật ${deviceName}. Kiểm tra lại quyền truy cập Firebase.`);
  }
}

// Cập nhật mức công suất (Level) của thiết bị lên Firebase
async function updateDeviceLevel(deviceName, value, regionKey = currentRegion) {
  try {
    await update(ref(db, `smartCity/${regionKey}/devices`), { [deviceName]: Number(value) });
    return true;
  } catch (error) {
    console.error(`Không thể cập nhật ${deviceName}:`, error);
    alert(`Không thể cập nhật mức công suất. Kiểm tra lại quyền truy cập Firebase.`);
    return false;
  }
}

function scheduleSliderUpdate(deviceName, value, regionKey = currentRegion) {
  clearTimeout(sliderUpdateTimers[deviceName]);
  const numericValue = Number(value);
  sliderUpdateTimers[deviceName] = setTimeout(async () => {
    await updateDeviceLevel(deviceName, numericValue, regionKey);
    suppressSliderSync[deviceName] = false;
  }, 120);
}

// Sự kiện thay đổi thanh trượt Quạt
fanLevelSlider.addEventListener("input", () => {
  suppressSliderSync.fanLevel = true;
  fanLevelValue.textContent = fanLevelSlider.value + "%";
  setProgress(fanProgress, fanLevelSlider.value);
  if (fanQuickStatus) fanQuickStatus.textContent = `${fanLevelSlider.value}%`;

  fanInlineStatus.textContent =
    `Quạt mức ${fanLevelSlider.value}%`;

  scheduleSliderUpdate("fanLevel", fanLevelSlider.value);
});

// Sự kiện thay đổi thanh trượt Bơm
pumpLevelSlider.addEventListener("input", () => {
  suppressSliderSync.pumpLevel = true;
  pumpLevelValue.textContent = `${pumpLevelSlider.value}%`;
  setProgress(pumpProgress, pumpLevelSlider.value);
  pumpInlineStatus.textContent = `Bơm mức ${pumpLevelSlider.value}%`;
  if (pumpQuickStatus) pumpQuickStatus.textContent = `${pumpLevelSlider.value}%`;
  scheduleSliderUpdate("pumpLevel", pumpLevelSlider.value);
});

regionSelect.addEventListener("change", (event) => listenRegion(event.target.value));
refreshBtn.addEventListener("click", () => listenRegion(regionSelect.value));
Object.entries(deviceButtons).forEach(([deviceName, button]) => button.addEventListener("click", () => toggleDevice(deviceName)));
// Hàm cập nhật đồng hồ thời gian thực

// Cập nhật đồng hồ hiển thị thời gian thực trên giao diện
function updateRealTimeClock() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  lastUpdated.textContent = `Cập nhật: ${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Gọi ngay lập tức để hiển thị luôn không bị trễ 1 giây
updateRealTimeClock();
// Cho đồng hồ đếm mỗi 1000ms (1 giây)
setInterval(updateRealTimeClock, 1000);

setTimeout(initCharts, 80);
listenRegion(currentRegion);
// =========================
// CHATBOT + GEMINI
// =========================

let autoMode = false;

const chatbotFab = document.getElementById("chatbotFab");
const chatbotPanel = document.getElementById("chatbotPanel");
const chatbotClose = document.getElementById("chatbotClose");
const chatbotSend = document.getElementById("chatbotSend");
const chatbotInput = document.getElementById("chatbotInput");
const chatbotMessages = document.getElementById("chatbotMessages");

// Quản lý đóng/mở cửa sổ Chat
if (chatbotFab && chatbotPanel && chatbotClose && chatbotSend && chatbotInput && chatbotMessages) {
  chatbotFab.addEventListener("click", () => {
    chatbotPanel.classList.toggle("hidden");
  });

  chatbotClose.addEventListener("click", () => {
    chatbotPanel.classList.add("hidden");
  });

  chatbotSend.addEventListener("click", handleChatCommand);

  chatbotInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleChatCommand();
    }
  });
}

// Thêm tin nhắn của người dùng vào giao diện chat
function addUserMessage(text) {
  if (!chatbotMessages) return;
  const div = document.createElement("div");
  div.className = "user-msg";
  div.textContent = text;
  chatbotMessages.appendChild(div);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

// Thêm phản hồi của AI vào giao diện chat
function addBotMessage(text) {
  if (!chatbotMessages) return;
  const div = document.createElement("div");
  div.className = "bot-msg";
  div.textContent = text;
  chatbotMessages.appendChild(div);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

// Lấy trạng thái thiết bị hiện tại để gửi cho AI làm ngữ cảnh
function getCurrentDeviceStateForAI() {
  return {
    fan: deviceButtons.fan?.textContent === "ON",
    pump: deviceButtons.pump?.textContent === "ON",
    streetLight: deviceButtons.streetLight?.textContent === "ON",
    fanLevel: Number(fanLevelSlider?.value || 0),
    pumpLevel: Number(pumpLevelSlider?.value || 0)
  };
}

// Lấy dữ liệu cảm biến hiện tại để AI phân tích
function getCurrentSensorDataForAI() {
  return {
    temperature: parseFloat((ui.temperatureValue?.textContent || "").replace("°C", "")) || 0,
    humidity: parseFloat((ui.humidityValue?.textContent || "").replace("%", "")) || 0,
    rainfall: parseFloat((ui.waterLevelValue?.textContent || "").replace("mm", "")) || 0,
    aqi: parseFloat(ui.aqiValue?.textContent || "0") || 0
  };
}

// Gửi tin nhắn và ngữ cảnh hệ thống đến API Gemini
async function sendMessageToGemini(message) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      sensorData: getCurrentSensorDataForAI(),
      deviceState: getCurrentDeviceStateForAI(),
      currentRegion,
      autoMode
    })
  });

  return await response.json();
}

// Thực thi hành động dựa trên ý định (intent) mà AI trả về
async function applyAIAction(result) {
  try {
    switch (result.intent) {
      case "turn_on":
        if (result.device) {
          await update(ref(db, `smartCity/${currentRegion}/devices`), {
            [result.device]: true
          });
        }
        addBotMessage(result.message || "Đã bật thiết bị.");
        break;

      case "turn_off":
        if (result.device) {
          await update(ref(db, `smartCity/${currentRegion}/devices`), {
            [result.device]: false
          });
        }
        addBotMessage(result.message || "Đã tắt thiết bị.");
        break;

      case "set_level":
        if (result.device === "fan") {
          await update(ref(db, `smartCity/${currentRegion}/devices`), {
            fan: Number(result.value) > 0,
            fanLevel: Number(result.value) || 0
          });
        } else if (result.device === "pump") {
          await update(ref(db, `smartCity/${currentRegion}/devices`), {
            pump: Number(result.value) > 0,
            pumpLevel: Number(result.value) || 0
          });
        }
        addBotMessage(result.message || `Đã đặt mức ${result.value}%.`);
        break;

      case "enable_auto":
        autoMode = true;
        addBotMessage(result.message || "Đã bật chế độ tự động.");
        break;

      case "disable_auto":
        autoMode = false;
        addBotMessage(result.message || "Đã tắt chế độ tự động.");
        break;

      case "get_status":
        addBotMessage(buildStatusText());
        break;

      case "answer_only":
      default:
        addBotMessage(result.message || "Đã nhận yêu cầu.");
        break;
    }
  } catch (error) {
    console.error("Lỗi applyAIAction:", error);
    addBotMessage("Không thể cập nhật thiết bị từ AI.");
  }
}

// Tạo chuỗi văn bản thông báo trạng thái tổng hợp cho AI
function buildStatusText() {
  const sensors = getCurrentSensorDataForAI();
  const devices = getCurrentDeviceStateForAI();

  return `Khu vực ${regionNames[currentRegion]}:
Nhiệt độ: ${sensors.temperature}°C
Độ ẩm: ${sensors.humidity}%
Mực nước: ${sensors.rainfall} mm
AQI: ${sensors.aqi}
Quạt: ${devices.fan ? "ON" : "OFF"} (${devices.fanLevel}%)
Bơm: ${devices.pump ? "ON" : "OFF"} (${devices.pumpLevel}%)
Đèn đường: ${devices.streetLight ? "ON" : "OFF"}
Auto mode: ${autoMode ? "BẬT" : "TẮT"}`;
}

async function handleChatCommand() {
  const message = chatbotInput?.value?.trim();
  if (!message) return;

  addUserMessage(message);
  chatbotInput.value = "";

  try {
    const result = await sendMessageToGemini(message);
    await applyAIAction(result);
  } catch (error) {
    console.error("Gemini request error:", error);
    addBotMessage("Không kết nối được tới Gemini server.");
  }
}
