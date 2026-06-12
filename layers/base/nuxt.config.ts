// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  css: ['./layers/base/app/assets/css/main.css'],
  modules: ["@nuxt/ui"],
  ui: {
    colorMode: false,
    fonts: false,
  },
  icon: {
    provider: 'server',
  },
  runtimeConfig: {
    awsRegion: "",
    awsAccessKeyId: "",
    awsSecretAccessKey: "",
    uploadBucketName: "",
    cloudFrontDomain: "",
    cloudFrontKeyPairId: "",
    cloudFrontPrivateKey: "",
  },
});
