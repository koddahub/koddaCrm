import { CrmPage } from '@/app/ui/shell/crm-page';

type ControlPanelAutomationEditPageProps = {
  params: {
    id: string;
  };
};

export default function ControlPanelAutomationEditPage({ params }: ControlPanelAutomationEditPageProps) {
  return <CrmPage section="saas" communicationView="automations-edit" communicationRecordId={params.id} />;
}
