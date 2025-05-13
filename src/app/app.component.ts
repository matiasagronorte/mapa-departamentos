import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'mapa-departamentos';

  constructor() {
    this.verificarPassword();
  }

  private verificarPassword(): void {
    const PASSWORD = '660300';
    const mensaje = 'Ingrese la contraseña para acceder:';
    let intentos = 0;
    while (true) {
      const input = window.prompt(mensaje);
      if (input === PASSWORD) {
        break;
      } else {
        intentos++;
        window.alert('Contraseña incorrecta. Intente nuevamente.');
        window.location.reload();
        return;
      }
    }
  }
}
