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
      cameraPermission: "SmartKitchen dùng camera để quét mã vạch và chụp ảnh thực phẩm bạn thêm vào kho. Ảnh chỉ lưu cùng món và chỉ gia đình bạn xem được.",
      microphonePermission: false,
      recordAudioAndroid: false,
      barcodeScannerEnabled: true,
    }],
    ["expo-image-picker", {
      photosPermission: "SmartKitchen cần truy cập ảnh khi bạn chọn ảnh thực phẩm hoặc ảnh hóa đơn để thêm vào kho.",
      cameraPermission: "SmartKitchen dùng camera khi bạn chụp ảnh thực phẩm hoặc hóa đơn. Ảnh thực phẩm chỉ lưu cùng món và chỉ gia đình bạn xem được.",
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
