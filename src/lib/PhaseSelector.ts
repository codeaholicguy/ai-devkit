import inquirer from 'inquirer';
import { Phase, AVAILABLE_PHASES, PHASE_DISPLAY_NAMES } from '../types';

export class PhaseSelector {
  async selectPhases(all?: boolean, phases?: string): Promise<Phase[]> {
    let selectedPhases: Phase[] = [];

    if (all) {
      selectedPhases = [...AVAILABLE_PHASES];
    } else if (phases) {
      selectedPhases = this.parsePhaseString(phases);
    } else {
      selectedPhases = await this.promptPhaseSelection();
    }

    if (selectedPhases.length === 0) {
      console.log('No phases selected.');
      return [];
    }

    return selectedPhases;
  }

  private async promptPhaseSelection(): Promise<Phase[]> {
    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'phases',
        message: 'Which phases do you want to initialize? (or use --all flag)',
        choices: AVAILABLE_PHASES.map(phase => ({
          name: PHASE_DISPLAY_NAMES[phase],
          value: phase,
          checked: true
        }))
      }
    ]);

    return answers.phases;
  }

  private parsePhaseString(phases: string): Phase[] {
    return phases.split(',').map(p => p.trim()) as Phase[];
  }
  displaySelectionSummary(selected: Phase[]): void {
    if (selected.length === 0) {
      console.log('No phases selected.');
      return;
    }

    console.log('\nSelected phases:');
    selected.forEach(phase => {
      console.log(`  [OK] ${PHASE_DISPLAY_NAMES[phase]}`);
    });
    console.log('');
  }
}
