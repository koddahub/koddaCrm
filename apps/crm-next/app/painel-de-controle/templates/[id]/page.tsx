import { CrmPage } from '@/app/ui/shell/crm-page';

type TemplateDetailPageProps = {
  params: {
    id: string;
  };
};

export default function ControlPanelTemplateDetailPage({ params }: TemplateDetailPageProps) {
  return <CrmPage section="saas" communicationView="templates-view" communicationRecordId={params.id} />;
}
