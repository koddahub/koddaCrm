import { CrmPage } from '@/app/ui/shell/crm-page';

type ControlPanelEmailViewPageProps = {
  params: {
    id: string;
  };
};

export default function ControlPanelEmailViewPage({ params }: ControlPanelEmailViewPageProps) {
  return <CrmPage section="saas" communicationView="emails-view" communicationRecordId={params.id} />;
}
