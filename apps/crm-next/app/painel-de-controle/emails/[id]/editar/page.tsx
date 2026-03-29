import { CrmPage } from '@/app/ui/shell/crm-page';

type ControlPanelEmailEditPageProps = {
  params: {
    id: string;
  };
};

export default function ControlPanelEmailEditPage({ params }: ControlPanelEmailEditPageProps) {
  return <CrmPage section="saas" communicationView="emails-edit" communicationRecordId={params.id} />;
}
