/** Generation quality is separate from task budgets and provider selection. */
export type GenerationQuality = 'fast' | 'fine';

export function normalizeGenerationQuality(value: unknown): GenerationQuality {
  // Existing and unrecognized configurations keep the previous quality target.
  return value === 'fast' ? 'fast' : 'fine';
}

export const GENERATION_QUALITY_LABELS: Record<GenerationQuality, string> = {
  fast: '快速',
  fine: '精细',
};

/** Fast bounds optional visual polishing, never the validity or explicit scope. */
export const FAST_STATIC_REVIEW_IMAGE_LIMIT = 4;

export function generationQualityPrompt(value: unknown, workflow: 'agent' | 'single' | 'data' = 'agent'): string {
  const quality = normalizeGenerationQuality(value);
  const common = '用户明确的尺寸、数量、颜色、开口、关键特征与修改范围在两个档位都必须保留。不得按档位删掉明确要求，也不能扩大编辑权限或改变位置锁。几何与数据校验、真实证据规则和人工确认不变；缺少证据的项目保持待核对，不能把生成成功说成精确还原或保证合格。不可见结构明确为假设，不用无依据的细节冒充真实还原。';
  const target = quality === 'fast'
    ? '快速档：普通质量的可用草稿。优先整体剪影、长宽高比例、主要支撑/连接、真实开口和可识别的关键结构。复杂曲面仍按形状使用profile/lathe/loft/sweep或合适网格，不能用实心盒子冒充必要负空间。通常只规划少量主要特征，重复部分用阵列/复制；用户明确要求的特征再多也必须保留。仅为近景装饰的细小紧固件、隐蔽机构、额外贴图和反复表面润色默认不做，用户明确要求时例外。简单实体可直接edit_scene，复杂或有参考图的对象保留简短结构方案与referenceObservation。先完整构建用户范围，再集中检查一次；不为遍历细节清单反复生成长参数。'
    : '精细档：保留完整的用途相关质量目标。按参考可见事实规划外形、分区、负空间、功能结构、连接、边缘和表面特征，采用合适的连续几何及真实部件绑定。结构完成后做受影响对象多视角近景、必要的底部/遮挡诊断和全景复核，按明确缺陷局部修复；不靠增加零件数或预算冒充质量，不为unknown无限优化。';
  const workflowText = workflow === 'data'
    ? '当前为隔离组件数据生成：完成全部要求的数据与尺寸检查后submit_data_preview。此路径不做视觉验收，不能标记通过；后续由主任务统一检查场景关系与画面。'
    : workflow === 'single'
    ? '当前为单次兼容生成：只生成一个合法JSON命令批。两档只改变建模取舍，此路径不执行多轮视觉复核与修复；summary必须说明是未经视觉验收的数据草稿，不能宣称已通过精细验收。'
    : quality === 'fast'
      ? `快速复核流程：数据检查与capture_quality_review可同轮执行；自动图组只含两个全景视角，不自动遍历全部组件近景。下一轮读取图片后用review_model的completion提交待确认预览。明显缺陷集中局部修正后再取图，本次静态复核最多${FAST_STATIC_REVIEW_IMAGE_LIMIT}张实际截图（通常初查2张、修正后2张）；到限保留阶段草稿及未完成项，不伪造通过。全部六项细节验收仍保留，未拍近景或未审查的项目如实待核对，不必为凑六项而额外调用audit。动画仍必须完成原有动态样本复核，不能用静态图替代。`
      : '精细复核流程：使用完整的受影响组件多视角取景、六项细节验收和局部修复流程。每项pass仍需当前版本真实多角度依据；软件几何图不能验收材质。达到用户目标即可交付，受阻或预算到限明确保留未完成项。';
  const limits = workflow === 'single'
    ? '单次兼容路径沿用原有传输与输出限制；多轮任务预算监控和视觉修复仅适用于Pi模式。本档位不修改预算配置，也不承诺固定耗时或还原精度。'
    : '时间、轮数、已报告Token仍服从用户现有上限；档位不增加预算，也不承诺固定耗时或还原精度。';
  return `# 本次生成档位：${GENERATION_QUALITY_LABELS[quality]}\n${target}\n${common}\n${workflowText}\n${limits}`;
}
