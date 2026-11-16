import { Navigation } from '@/components/Navigation';
import { RunningBalanceView } from '@/components/runningBalance/RunningBalanceView';

export default function RunningBalancePage() {
  return (
    <div className="min-h-screen bg-background md:pl-60 pt-14 md:pt-0">
      <Navigation currentPage="running-balance" />
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        <RunningBalanceView />
      </main>
    </div>
  );
}
