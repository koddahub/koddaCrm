import { CrmPage } from '@/app/ui/shell/crm-page';

type ControlPanelSocialEditPageProps = {
  params: {
    id: string;
  };
};

export default function ControlPanelSocialEditPage({ params }: ControlPanelSocialEditPageProps) {
  return <CrmPage section="saas" communicationView="social-edit" communicationRecordId={params.id} />;
}
