import { Component, OnInit } from '@angular/core';
import * as L from 'leaflet';
import * as topojson from 'topojson-client';
import { CommonModule } from '@angular/common';
import * as Papa from 'papaparse';

// Interfaces para los datos
interface DepartamentoADR {
  provincia: string;
  departamento: string;
  en_adr: number;
}

interface DepartamentoDatos {
  provincia: string;
  departamento: string;
  datos: boolean;
  recuentoTitular?: number;
  recuentoEstablecimiento?: number;
  hectareasSembradas?: number;
  hectareasNoClientes?: number;
  porcentajeNoClientes?: string;
  datosCompletos?: any; // Almacenamos los datos completos para el tooltip
}

@Component({
  selector: 'app-mapa',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mapa.component.html',
  styleUrls: ['./mapa.component.scss']
})
export class MapaComponent implements OnInit {
  private map!: L.Map;
  private geoJsonLayer?: L.GeoJSON;
  
  // Datos procesados
  private departamentosADR: DepartamentoADR[] = [];
  private departamentosConDatos: DepartamentoDatos[] = [];

  constructor() { }

  ngOnInit(): void {
    this.initMap();
    this.cargarDatos();
  }

  private initMap(): void {
    // Crear el mapa
    this.map = L.map('map', {
      center: [-32.5, -60], // Coordenadas para centro de Argentina
      zoom: 6, // Zoom inicial
      zoomControl: true
    });

    // Agregar capa base de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    console.log('Mapa inicializado correctamente');
  }

  private cargarDatos(): void {
    // Cargar datos de ADR
    this.cargarDatosADR()
      .then(() => this.cargarDatosDepartamentos())
      .then(() => this.loadTopoJson())
      .catch(error => console.error('Error al cargar datos:', error));
  }

  private cargarDatosADR(): Promise<void> {
    return new Promise((resolve, reject) => {
      Papa.parse('./assets/adr_departamentos.csv', {
        download: true,
        header: true,
        delimiter: ',', // Aseguramos usar coma como delimitador
        skipEmptyLines: true,
        complete: (result: { data: any[]; }) => {
          this.departamentosADR = result.data
            .filter((item: any) => item.provincia && item.departamento) // Filtrar datos vacíos
            .map((item: any) => ({
              provincia: this.normalizarTexto(item.provincia),
              departamento: this.normalizarTexto(item.departamento),
              en_adr: parseInt(item.en_adr || '0')
            }));
          console.log('Datos ADR cargados:', this.departamentosADR.length, 'departamentos');
          console.log('Muestra de departamentos ADR:', this.departamentosADR.slice(0, 5));
          resolve();
        },
        error: (error: any) => {
          console.error('Error al cargar datos ADR:', error);
          reject(error);
        }
      });
    });
  }

  private cargarDatosDepartamentos(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Obtener todas las provincias que tienen datos
      const provincias = ['santa_fe', 'misiones', 'cordoba', 'entre_rios', 'santiago_del_estero','corrientes']; // Agrega todas las provincias que necesites
      let promesas: Promise<void>[] = [];

      // Crear una promesa para cargar los datos de cada provincia
      provincias.forEach(provincia => {
        const promesa = new Promise<void>((resolveProvince, rejectProvince) => {
          Papa.parse(`./assets/datos-${provincia}.csv`, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (result: { data: any[]; }) => {
              const datosProvincia = result.data
                .filter((item: any) => 
                  item['PROVINCIA ESTABLECIMIENTO'] && 
                  item['PARTIDO ESTABLECIMIENTO']
                )
                .map((item: any) => {
                  // Convertir los valores numéricos de string a number
                  const hectareasSembradas = this.parseNumericValue(item['Suma de TOTAL DE HECTAREAS SEMBRADAS']);
                  const hectareasNoClientes = this.parseNumericValue(item['Total de hectareas de no clientes']);
                  
                  return {
                    provincia: this.normalizarTexto(item['PROVINCIA ESTABLECIMIENTO']),
                    departamento: this.normalizarTexto(item['PARTIDO ESTABLECIMIENTO']),
                    datos: true,
                    recuentoTitular: parseInt(item['Recuento de TITULAR']) || 0,
                    recuentoEstablecimiento: parseInt(item['Recuento de NOMBRE ESTABLECIMIENTO']) || 0,
                    hectareasSembradas: hectareasSembradas,
                    hectareasNoClientes: hectareasNoClientes,
                    porcentajeNoClientes: item['Porcentaje de hectareas de no clientes'],
                    datosCompletos: item // Guardamos los datos originales completos
                  };
                });
              
              // Agregar los datos de esta provincia al array principal
              this.departamentosConDatos = [...this.departamentosConDatos, ...datosProvincia];
              console.log(`Datos de ${provincia} cargados:`, datosProvincia.length, 'departamentos');
              resolveProvince();
            },
            error: (error: any) => {
              console.error(`Error al cargar datos de ${provincia}:`, error);
              // Resolvemos en lugar de rechazar para que el proceso continúe con otras provincias
              resolveProvince();
            }
          });
        });
        
        promesas.push(promesa);
      });

      // Esperar a que todas las promesas se resuelvan
      Promise.all(promesas)
        .then(() => {
          console.log('Total de departamentos con datos cargados:', this.departamentosConDatos.length);
          console.log('Muestra de departamentos con datos:', this.departamentosConDatos.slice(0, 5));
          resolve();
        })
        .catch(error => {
          console.error('Error al cargar datos de departamentos:', error);
          reject(error);
        });
    });
  }

  private parseNumericValue(value: string): number {
    if (!value) return 0;
    
    // Primero reemplazamos la coma decimal por punto si existe
    const cleanValue = value.replace(',', '.');
    
    // Intentamos convertir a número
    const numValue = parseFloat(cleanValue);
    
    // Devolvemos el valor numérico o 0 si no es válido
    return isNaN(numValue) ? 0 : numValue;
  }

  private loadTopoJson(): void {
    // Lista de provincias para las que hay archivos TopoJSON
    const provincias = ['santa_fe', 'cordoba', 'corrientes', 'entre_rios', 'santiago_del_estero','misiones']; // Agrega/quita provincias según tus archivos

    // Cargar todos los archivos TopoJSON en paralelo
    const promesas = provincias.map(provincia => {
      const url = `./assets/departamentos-${provincia}.topojson`;
      return fetch(url)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status} al cargar ${url}`);
          }
          return response.json().then(topoData => ({ provincia, topoData }));
        })
        .catch(error => {
          console.error(`Error al cargar el TopoJSON de ${provincia}:`, error);
          return null; // Para que Promise.all no falle por un archivo
        });
    });

    Promise.all(promesas).then(results => {
      // Filtrar los archivos que se cargaron correctamente
      const geoJsonFeatures: any[] = [];
      results.forEach(result => {
        if (result && result.topoData && result.topoData.objects) {
          const objectName = Object.keys(result.topoData.objects)[0];
          if (objectName) {
            const geoJsonData = topojson.feature(result.topoData, result.topoData.objects[objectName]) as any;
            if (geoJsonData.features && geoJsonData.features.length > 0) {
              // Añadir la provincia a cada feature si no está
              geoJsonData.features.forEach((f: any) => {
                if (!f.properties.provincia) {
                  f.properties.provincia = result.provincia.replace('_', ' ');
                }
              });
              geoJsonFeatures.push(...geoJsonData.features);
            }
          }
        }
      });

      if (geoJsonFeatures.length > 0) {
        // Crear un FeatureCollection combinando todos los features
        const combinedGeoJson = {
          type: 'FeatureCollection',
          features: geoJsonFeatures
        };
        // Log de muestra
        console.log('Muestra de departamentos en GeoJSON:', 
          geoJsonFeatures.slice(0, 3).map((f: any) => ({
            departamento: f.properties.departamento || f.properties.nam,
            provincia: f.properties.provincia
          }))
        );
        this.renderGeoJson(combinedGeoJson);
      } else {
        console.error('No se cargó ningún departamento desde los TopoJSON.');
      }
    });
  }

  private renderGeoJson(geoJsonData: any): void {
    // Eliminar la capa anterior si existe
    if (this.geoJsonLayer) {
      this.map.removeLayer(this.geoJsonLayer);
    }

    // Crear una nueva capa GeoJSON
    this.geoJsonLayer = L.geoJSON(geoJsonData, {
      style: (feature) => this.estilizarDepartamento(feature),
      onEachFeature: (feature, layer) => {
        // Asignar popup con el nombre del departamento y su estado
        const propiedades = feature.properties;
        const nombre = propiedades.departamento || propiedades.nam || propiedades.nombre || 'Desconocido';
        const provincia = propiedades.provincia || 'SANTA FE'; // Por defecto asumimos Santa Fe
        
        // Para depuración
        const nombreNormalizado = this.normalizarTexto(nombre);
        const provinciaNormalizada = this.normalizarTexto(provincia);
        
        // Determinar estado con nueva lógica
        const estaEnADR = this.estaEnADR(provinciaNormalizada, nombreNormalizado);
        const tieneDatos = this.tieneDatos(provinciaNormalizada, nombreNormalizado);
        let estado = '';
        if (tieneDatos) {
          estado = 'Con datos';
        } else if (estaEnADR) {
          estado = 'En ADR, sin datos';
        } else {
          estado = 'Fuera de ADR y sin datos';
        }
        
        // Obtener los datos completos si existen
        const datosDepartamento = this.obtenerDatosDepartamento(provinciaNormalizada, nombreNormalizado);
        
        // Construir el contenido del popup según si hay datos o no
        let popupContent = `
          <div class="departamento-popup">
            <h3>${nombre}</h3>
            <p>Provincia: ${provincia}</p>
            <p>Estado: ${estado}</p>
        `;
        
        if (tieneDatos && datosDepartamento) {
          // Si tiene datos, mostramos todos los detalles
          popupContent += `
            <div class="datos-detalle">
              <h4>Información detallada:</h4>
              <table>
                <tr>
                  <td>Titulares:</td>
                  <td>${datosDepartamento.recuentoTitular}</td>
                </tr>
                <tr>
                  <td>Establecimientos:</td>
                  <td>${datosDepartamento.recuentoEstablecimiento}</td>
                </tr>
                <tr>
                  <td>Hectáreas sembradas:</td>
                  <td>${datosDepartamento.hectareasSembradas?.toLocaleString('es-AR')} ha</td>
                </tr>
                <tr>
                  <td>Hectáreas de no clientes:</td>
                  <td>${datosDepartamento.hectareasNoClientes?.toLocaleString('es-AR')} ha</td>
                </tr>
                <tr>
                  <td>% Hectáreas no clientes:</td>
                  <td>${datosDepartamento.porcentajeNoClientes}</td>
                </tr>
              </table>
            </div>
          `;
        }
        
        popupContent += `</div>`;
        
        layer.bindPopup(popupContent);

        // Agregar efecto hover
        layer.on({
          mouseover: (e) => {
            const layer = e.target;
            layer.setStyle({
              weight: 3,
              color: '#666',
              fillOpacity: 0.7
            });
            layer.bringToFront();
          },
          mouseout: (e) => {
            this.geoJsonLayer?.resetStyle(e.target);
          },
          click: (e) => {
            this.map.fitBounds(e.target.getBounds());
          }
        });
      }
    }).addTo(this.map);

    // Ajustar la vista al tamaño del GeoJSON
    if (this.geoJsonLayer.getBounds().isValid()) {
      this.map.fitBounds(this.geoJsonLayer.getBounds());
    }
  }

  private estilizarDepartamento(feature: any): L.PathOptions {
    const propiedades = feature.properties;
    const nombre = propiedades.departamento || propiedades.nam || propiedades.nombre || '';
    const provincia = propiedades.provincia || 'SANTA FE'; // Por defecto asumimos Santa Fe
    
    // Normalizar nombre para comparar
    const nombreNormalizado = this.normalizarTexto(nombre);
    const provinciaNormalizada = this.normalizarTexto(provincia);
    
    // Determinar si tiene datos
    const tieneDatos = this.tieneDatos(provinciaNormalizada, nombreNormalizado);
    // Determinar si está en ADR
    const estaEnADR = this.estaEnADR(provinciaNormalizada, nombreNormalizado);
    
    // Nueva lógica:
    // ✅ Verde: Si tiene datos (aunque no esté en ADR)
    // 🔵 Azul: Si está en ADR pero no tiene datos
    // 🔘 Gris: Si no está en ADR ni tiene datos
    let color = '#808080'; // Gris por defecto
    let opacity = 0.7;
    
    if (tieneDatos) {
      color = '#4CAF50'; // Verde
    } else if (estaEnADR) {
      color = '#3388ff'; // Azul
    }
    
    return {
      color: '#333',
      weight: 1,
      opacity: 0.8,
      fillColor: color,
      fillOpacity: opacity
    };
  }

  private estaEnADR(provincia: string, departamento: string): boolean {
    // Coincidencia estricta por provincia y departamento normalizados
    return this.departamentosADR.some(d =>
      d.provincia === provincia && d.departamento === departamento && d.en_adr === 1
    );
  }

  private tieneDatos(provincia: string, departamento: string): boolean {
    // Coincidencia estricta por provincia y departamento normalizados
    return this.departamentosConDatos.some(d =>
      d.provincia === provincia && d.departamento === departamento
    );
  }

  private obtenerDatosDepartamento(provincia: string, departamento: string): DepartamentoDatos | null {
    // Coincidencia estricta por provincia y departamento normalizados
    return this.departamentosConDatos.find(d =>
      d.provincia === provincia && d.departamento === departamento
    ) || null;
  }

  private determinarEstadoDepartamento(provincia: string, departamento: string): string {
    const provinciaNormalizada = this.normalizarTexto(provincia);
    const departamentoNormalizado = this.normalizarTexto(departamento);
    
    if (!this.estaEnADR(provinciaNormalizada, departamentoNormalizado)) {
      return 'Sin datos';
    }
    
    if (this.tieneDatos(provinciaNormalizada, departamentoNormalizado)) {
      return 'Con datos';
    }
    
    return 'Sin datos';
  }
  
  private determinarEstadoConDebug(provincia: string, departamento: string): string {
    const adrRecord = this.departamentosADR.find(d => {
      const provinciaCoincide = 
        d.provincia === provincia || 
        d.provincia.includes(provincia) || 
        provincia.includes(d.provincia);
        
      const departamentoCoincide = 
        d.departamento === departamento || 
        d.departamento.includes(departamento) || 
        departamento.includes(d.departamento);
        
      return provinciaCoincide && departamentoCoincide;
    });
    
    const datosRecord = this.departamentosConDatos.find(d => {
      const provinciaCoincide = 
        d.provincia === provincia || 
        d.provincia.includes(provincia) || 
        provincia.includes(d.provincia);
        
      const departamentoCoincide = 
        d.departamento === departamento || 
        d.departamento.includes(departamento) || 
        departamento.includes(d.departamento);
        
      return provinciaCoincide && departamentoCoincide;
    });
    
    if (!adrRecord || adrRecord.en_adr !== 1) {
      return 'Sin datos';
    }
    
    if (datosRecord) {
      return 'Con datos';
    }
    
    return 'Sin datos';
  }

  private normalizarTexto(texto: string): string {
    if (!texto) return '';
    
    return texto.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\./g, '')
      .replace(/_/g, ' ')
      .trim();
  }
}