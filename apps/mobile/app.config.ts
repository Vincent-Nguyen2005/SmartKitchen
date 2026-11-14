import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "SmartKitchen",
  slug: "smartkitchen",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  scheme: "smartkitchen",
  ios: { supportsTablet: true, bundleIdentifier: "com.smartkitchen.mobile" },
  android: { package: "com.smartkitchen.mobile" },
  web: { bundler: "metro" },
  plugins: [
    ["expo-camera", {
      cameraPermission: "SmartKitchen cần camera để quét mã vạch thực phẩm.",
      microphonePermission: false,
      recordAudioAndroid: false,
      barcodeScannerEnabled: true,
    }],
    ["expo-image-picker", {
      photosPermission: "SmartKitchen cần truy cập ảnh để đọc hóa đơn khi bạn chọn ảnh.",
      cameraPermission: "SmartKitchen cần camera để chụp hóa đơn khi bạn chọn chụp ảnh.",
      microphonePermission: "SmartKitchen dùng micro cho tính năng nhận dạng tên thực phẩm bằng giọng nói.",
    }],
    ["expo-speech-recognition", {
      microphonePermission: "SmartKitchen dùng micro để nhận dạng tên thực phẩm bạn đọc.",
      speechRecognitionPermission: "SmartKitchen dùng nhận dạng giọng nói trên thiết bị để tạo bản nháp thực phẩm.",
      androidSpeechServicePackages: ["com.google.android.googlequicksearchbox"],
    }],
    "@react-native-community/datetimepicker",
  ],
};

export default config;
