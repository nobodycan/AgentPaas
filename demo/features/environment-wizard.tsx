"use client";

import React, {
  useRef,
  useState,
} from "react";

import { useDemo } from "../lib/demo-store";
import {
  DEFAULT_WIZARD_INPUT,
  validateWizardStep,
} from "../lib/view-models";
import type {
  EnvironmentWizardInput,
  WizardStep,
  WizardValidationErrors,
} from "../lib/view-models";
import {
  EndpointReviewStep,
  GovernanceSecurityStep,
  ImageRuntimeStep,
  ServiceOwnershipStep,
} from "./environment-wizard-steps";
import type { WizardStepBodyProps } from "./environment-wizard-steps";

export interface CreateEnvironmentWizardProps {
  onNavigate(destination: string): void;
}

const WIZARD_STEPS: readonly {
  id: WizardStep;
  title: string;
  description: string;
}[] = [
  {
    id: 1,
    title: "服务归属",
    description: "确认环境名称、项目与责任人",
  },
  {
    id: 2,
    title: "镜像与运行时",
    description: "选择镜像、容量和 RuntimePlan",
  },
  {
    id: 3,
    title: "治理策略",
    description: "绑定网络与生产安全基线",
  },
  {
    id: 4,
    title: "Endpoint",
    description: "确认入口、会话亲和与部署摘要",
  },
];

const STEP_COMPONENTS: Record<
  WizardStep,
  React.ComponentType<WizardStepBodyProps>
> = {
  1: ServiceOwnershipStep,
  2: ImageRuntimeStep,
  3: GovernanceSecurityStep,
  4: EndpointReviewStep,
};

export function CreateEnvironmentWizard({
  onNavigate,
}: CreateEnvironmentWizardProps): React.ReactElement {
  const {
    createEnvironment,
    advanceDeployment,
  } = useDemo();
  const [step, setStep] = useState<WizardStep>(1);
  const [input, setInput] = useState<EnvironmentWizardInput>({
    ...DEFAULT_WIZARD_INPUT,
  });
  const [errors, setErrors] =
    useState<WizardValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submittingRef = useRef(false);
  const StepBody = STEP_COMPONENTS[step];

  const updateField = <Key extends keyof EnvironmentWizardInput,>(
    field: Key,
    value: EnvironmentWizardInput[Key],
  ) => {
    setInput((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const validateAndContinue = () => {
    const nextErrors = validateWizardStep(input, step);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0 && step < 4) {
      setStep((step + 1) as WizardStep);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }

    const validations = WIZARD_STEPS.map(({ id }) => ({
      step: id,
      errors: validateWizardStep(input, id),
    }));
    const firstInvalid = validations.find(
      ({ errors: stepErrors }) =>
        Object.keys(stepErrors).length > 0,
    );
    if (firstInvalid) {
      setStep(firstInvalid.step);
      setErrors(firstInvalid.errors);
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError("");

    try {
      const environmentId = createEnvironment({
        name: input.name,
        project: input.project,
        owner: input.owner,
        image: input.image,
        containerPort: input.containerPort,
        desiredInstances: input.desiredInstances,
        runtimePlanId: input.runtimePlanId,
        ingressProfileId: input.ingressProfileId,
        egressProfileId: input.egressProfileId,
        endpointVisibility: input.endpointVisibility,
        sessionHeader: input.sessionHeader,
        secureTaskProfileId:
          input.secureTaskProfileId || undefined,
      });
      advanceDeployment(environmentId, 0);
      onNavigate(
        `/environments/${encodeURIComponent(
          environmentId,
        )}/overview`,
      );
    } catch {
      submittingRef.current = false;
      setIsSubmitting(false);
      setSubmitError("创建失败，请检查配置后重试。");
    }
  };

  return (
    <section aria-labelledby="environment-create-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">四步部署向导</p>
          <h1 id="environment-create-title">创建运行环境</h1>
          <p>
            把镜像、运行时容量与企业治理 Profile
            组合成可访问、可审计的 Agent 服务。
          </p>
        </div>
      </header>

      <ol className="wizard-stepper" aria-label="创建运行环境进度">
        {WIZARD_STEPS.map((wizardStep) => (
          <li
            key={wizardStep.id}
            className={
              wizardStep.id === step
                ? "wizard-stepper__item wizard-stepper__item--current"
                : wizardStep.id < step
                  ? "wizard-stepper__item wizard-stepper__item--complete"
                  : "wizard-stepper__item"
            }
            aria-current={
              wizardStep.id === step ? "step" : undefined
            }
          >
            <span>{wizardStep.id}</span>
            <div>
              <strong>{wizardStep.title}</strong>
              <small>{wizardStep.description}</small>
            </div>
          </li>
        ))}
      </ol>

      <form className="wizard-layout" onSubmit={handleSubmit}>
        <section className="content-card wizard-card">
          <StepBody
            input={input}
            errors={errors}
            onChange={updateField}
          />

          {submitError ? (
            <p className="field-error" role="alert">
              {submitError}
            </p>
          ) : null}
          <footer className="wizard-actions">
            <button
              type="button"
              className="button button--quiet"
              disabled={step === 1 || isSubmitting}
              onClick={() => {
                setErrors({});
                setStep((step - 1) as WizardStep);
              }}
            >
              上一步
            </button>
            {step < 4 ? (
              <button
                type="button"
                className="button button--primary"
                disabled={isSubmitting}
                onClick={validateAndContinue}
              >
                下一步
              </button>
            ) : (
              <button
                type="submit"
                className="button button--primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? "正在创建…" : "创建并部署"}
              </button>
            )}
          </footer>
        </section>

        <aside className="content-card wizard-summary">
          <p className="eyebrow">交付护栏</p>
          <h2>平台替团队承担复杂度</h2>
          <ul>
            <li>演示在部署时确定性生成并固定镜像 Digest</li>
            <li>生产安全基线不可关闭</li>
            <li>Secret 只保存引用，不在表单展示明文</li>
            <li>Endpoint Ready 后才注册负载均衡后端</li>
          </ul>
        </aside>
      </form>
    </section>
  );
}
