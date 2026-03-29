import { CrmPage } from '@/app/ui/shell/crm-page';

type TemplateEditPageProps = {
  params: {
    id: string;
  };
};

export default function ControlPanelTemplateEditPage({ params }: TemplateEditPageProps) {
  return <CrmPage section="saas" communicationView="templates-edit" communicationRecordId={params.id} />;
}
