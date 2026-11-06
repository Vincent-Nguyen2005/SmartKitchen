declare module "expo-constants" {
  const Constants: {
    expoConfig?: {
      extra?: {
        eas?: {
          projectId?: string;
        };
        [key: string]: any;
      };
    };
    manifest?: any;
    [key: string]: any;
  };
  export default Constants;
}
