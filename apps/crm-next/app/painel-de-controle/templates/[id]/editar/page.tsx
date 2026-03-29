import { CrmPage } from '@/app/ui/shell/crm-page';

type TemplateEditPageProps = {
  params: {
    id: string;
  };
};

export default function ControlPanelTemplateEditPage({ params }: TemplateEditPageProps) {
  return (
    <CrmPage
      section="saas"
      saasInitialTab="templates"
      saasTemplatesRouteMode="edit"
      saasTemplateRouteId={params.id}
    />
  );
}
