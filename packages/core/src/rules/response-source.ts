// 응답 출처(`ResponseSource`) 결합 — F1-e(`docs/adr/0009-step-level-response-provenance.md` D2)
// 담당: implementer(ADR-0009 Follow-up #2).
//
// `MediationResult.source`(화면 레벨 단일 배지의 입력)는 `MediationResult.stepSources`
// (`{ c1, c2, c4 }`) 세 값 중 **가장 신뢰도가 낮은 값**과 같아야 한다는 불변식을 가진다
// (우선순위 `fallback` > `cache` > `live`). 이 파일이 그 불변식의 **유일한 구현**이다 — 웹·확장
// 어댑터가 각자 다시 만들지 않는다(D2 "파생을 함수 하나로만 한다").
//
// 🔴 타입으로 강제하지 않는다 — 판별 유니온은 *짝* 제약(`offered`⟺`basis`, F1-c)에만 통하고
// 이 불변식은 **세 값의 집계**라 유니온으로 쓰면 3³=27조합이 된다(ADR-0009 D2). 대신 이 함수의
// 테스트(`response-source.test.ts`)가 불변식의 근거가 된다.
import type { ResponseSource } from '../contract';

const SOURCE_PRIORITY: Record<ResponseSource, number> = { fallback: 2, cache: 1, live: 0 };

/**
 * 둘 이상의 `ResponseSource`를 하나로 합친다 — 신뢰도가 가장 낮은 값이 이긴다
 * (`fallback` > `cache` > `live`). `apps/web/app/api/mediate/route.ts`는
 * `combineSource(stepSources.c1, stepSources.c2, stepSources.c4)`처럼 세 스텝의 출처를 한 번에
 * 넘겨 `MediationResult.source`를 파생시킨다(원래 그 라우트 지역에 있던 동명의 2-인자 함수를
 * 이곳으로 승격했다 — F1-e 이전에는 계약에 없던 규칙을 라우트가 그 자리에서 정하고 있었다).
 */
export function combineSource(
  first: ResponseSource,
  second: ResponseSource,
  ...rest: ResponseSource[]
): ResponseSource {
  return [first, second, ...rest].reduce((worst, current) =>
    SOURCE_PRIORITY[current] >= SOURCE_PRIORITY[worst] ? current : worst,
  );
}
