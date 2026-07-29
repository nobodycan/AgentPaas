import { AgentPaaSDemo } from "../../components/agent-paas-demo";
import { DemoProvider } from "../../lib/demo-store";

interface CatchAllPageProps {
  params: Promise<{
    path: string[];
  }>;
}

export default async function CatchAllPage({
  params,
}: CatchAllPageProps): Promise<React.ReactElement> {
  const { path } = await params;
  const initialPath = `/${path.map(encodeURIComponent).join("/")}`;

  return (
    <DemoProvider>
      <AgentPaaSDemo initialPath={initialPath} />
    </DemoProvider>
  );
}
