import type {SceneDocument} from '../domain/types';
import {inspectSceneQuality} from '../domain/sceneQuality';
import {detailTargets} from '../domain/detailAcceptance';
import {visualReviewPlan} from '../domain/visualReviewPlan';
import {normalizeGenerationQuality, type GenerationQuality} from './generationPolicy';

/** A smaller capture agenda is not a different or weaker definition of pass. */
export function generationReviewPlan(base: SceneDocument, draft: SceneDocument, quality: GenerationQuality, offset = 0): ReturnType<typeof visualReviewPlan> & {generationQuality: GenerationQuality; coverage: 'basic-overview' | 'component-multiview'; deferredDetailTargets: number} {
  if (normalizeGenerationQuality(quality) === 'fine') {
    return {...visualReviewPlan(base, draft, offset), generationQuality: 'fine', coverage: 'component-multiview', deferredDetailTargets: 0};
  }
  if (offset !== 0) throw new Error('快速模式只提供一组全景检查图；没有后续组件页，未审查细节保持待核对。');
  const totalTargets = detailTargets(base, draft).length;
  const qualityReport = inspectSceneQuality(draft);
  return {
    revision: draft.revision,
    totalTargets,
    nextOffset: null,
    interactions: [],
    wholeViews: ['perspective', 'top'],
    targets: [],
    risks: qualityReport.spatial.candidates.map(c => ({a: c.a, b: c.b, kind: c.kind})),
    accepted: false,
    generationQuality: 'fast',
    coverage: 'basic-overview',
    deferredDetailTargets: totalTargets,
  };
}
