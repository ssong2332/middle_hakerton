/** @type {import('next').NextConfig} */
const nextConfig = {
  // `packages/core`는 별도 workspace 패키지이며 사전 빌드 산출물이 없다(T2 스캐폴드 시점) —
  // Next가 TS 소스를 직접 트랜스파일하게 한다(`docs/Architecture.md` Risks "초기 셋업 30분" 대가).
  transpilePackages: ['@cross-border/core'],
};

export default nextConfig;
