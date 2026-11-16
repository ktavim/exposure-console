import { Routes } from '@angular/router';
import { ShellComponent } from './layout/shell.component';

export const appRoutes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Queue · Exposure Console',
        data: { list: 'queue' },
        loadComponent: () =>
          import('./features/exposures/queue/exposure-list.component').then((m) => m.ExposureListComponent)
      },
      {
        path: 'history',
        title: 'History · Exposure Console',
        data: { list: 'history' },
        loadComponent: () =>
          import('./features/exposures/queue/exposure-list.component').then((m) => m.ExposureListComponent)
      },
      {
        path: 'exposures/:id',
        title: 'Exposure · Exposure Console',
        loadComponent: () =>
          import('./features/exposures/workspace/workspace.component').then((m) => m.WorkspaceComponent)
      }
    ]
  }
];
