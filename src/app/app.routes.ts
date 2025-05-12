import { Routes } from '@angular/router';
import { MapaComponent } from './mapa/mapa.component';

export const routes: Routes = [
  { path: '', component: MapaComponent },
  { path: '**', redirectTo: '' }
];
