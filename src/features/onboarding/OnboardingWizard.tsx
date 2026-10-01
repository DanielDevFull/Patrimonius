import { Button } from '@/components/ui';
import { updateSettings } from '@/db/repo';

/** TODO: implementar o assistente de primeiro uso. */
export default function OnboardingWizard() {
  return (
    <div className="p-8">
      <Button onClick={() => void updateSettings({ onboardingDone: true })}>Começar</Button>
    </div>
  );
}
