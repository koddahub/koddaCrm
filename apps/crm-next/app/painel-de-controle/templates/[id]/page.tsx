import { CrmPage } from '@/app/ui/shell/crm-page';

type TemplateDetailPageProps = {
  params: {
    id: string;
  };
};

export default function ControlPanelTemplateDetailPage({ params }: TemplateDetailPageProps) {
  return (
    <CrmPage
      section="saas"
      saasInitialTab="templates"
      saasTemplatesRouteMode="view"
      saasTemplateRouteId={params.id}
    />
  );
}
