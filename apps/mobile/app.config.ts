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
      // Photos only (no video), and voice input was removed: no microphone permission.
      microphonePermission: false,
    }],
    ["expo-location", {
      // Asked only when ordering in Đi chợ ("Đặt hàng") or on the map picker, to fill the delivery address.
      locationWhenInUsePermission: "SmartKitchen dùng vị trí của bạn khi đặt hàng để điền sẵn địa chỉ giao hàng.",
    }],
    "@react-native-community/datetimepicker",
  ],
};

export default config;
