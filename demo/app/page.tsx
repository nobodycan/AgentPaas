import { AgentPaaSDemo } from "../components/agent-paas-demo";
import { DemoProvider } from "../lib/demo-store";

export default function Home() {
  return (
    <DemoProvider>
      <AgentPaaSDemo initialPath="/overview" />
    </DemoProvider>
  );
}
