import { Component, OnInit } from '@angular/core';
import * as L from 'leaflet';
import * as topojson from 'topojson-client';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as Papa from 'papaparse';
import { parse as parseWKT } from 'wellknown';
import { GeoJsonObject } from 'geojson';

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
  datosCompletos?: any;
}

interface MapLayer {
  id: string;
  nombre: string;
  visible: boolean;
  color: string;
  descripcion: string;
}

@Component({
  selector: 'app-mapa',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mapa.component.html',
  styleUrls: ['./mapa.component.scss']
})
export class MapaComponent implements OnInit {
  private map!: L.Map;
  private geoJsonLayer?: L.GeoJSON;
  private layersGroup: { [key: string]: L.Layer } = {};

  // Datos procesados
  private departamentosADR: DepartamentoADR[] = [];
  private departamentosConDatos: DepartamentoDatos[] = [];

  // Gestión de capas
  public capas: MapLayer[] = [
    {
      id: 'datos_regionales',
      nombre: 'Datos Regionales',
      visible: true,
      color: '#4CAF50',
      descripcion: 'Visualización unificada de ADR y datos de Agronorte'
    },
    {
      id: 'adr_agronorte',
      nombre: 'ADR Agronorte',
      visible: false,
      color: '#FF5722',
      descripcion: 'Capa detallada de ADR Agronorte desde CSV'
    },
    {
      id: 'sucursales_area',
      nombre: 'Sucursales',
      visible: true,
      color: '#9C27B0',
      descripcion: 'Áreas de influencia de sucursales desde CSV'
    }
  ];

  private sucursalesColors: string[] = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'
  ];

  constructor() { }

  ngOnInit(): void {
    this.initMap();
    this.cargarDatos();
  }

  private initMap(): void {
    this.map = L.map('map', {
      center: [-32.5, -60],
      zoom: 6,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);
  }

  private cargarDatos(): void {
    this.cargarDatosADR()
      .then(() => this.cargarDatosDepartamentos())
      .then(() => this.loadTopoJson())
      .then(() => this.cargarCapasCSV())
      .catch(error => console.error('Error al cargar datos:', error));
  }

  private cargarCapasCSV(): void {
    this.cargarCapaWKT('./assets/adr_agronorte_area.csv', 'adr_agronorte', '#FF5722');
    this.cargarCapaWKT('./assets/sucursales_area.csv', 'sucursales_area', '#9C27B0');
  }

  private cargarCapaWKT(url: string, layerId: string, color: string): void {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const features: any[] = [];
        const errores: string[] = [];

        results.data.forEach((row: any, index: number) => {
          if (row.WKT) {
            try {
              const geometry = parseWKT(row.WKT);
              if (geometry) {
                const featureColor = layerId === 'sucursales_area'
                  ? this.sucursalesColors[index % this.sucursalesColors.length]
                  : color;

                features.push({
                  type: 'Feature',
                  properties: {
                    nombre: row.nombre || row.PARTIDO || '',
                    descripcion: row['descripción'] || row['descripciÃ³n'] || row.estado || '',
                    color: featureColor
                  },
                  geometry: geometry
                });
              } else {
                errores.push(`Fila ${index + 1}: WKT inválido en "${row.nombre || row.PARTIDO || 'ID:' + index}"`);
              }
            } catch (e) {
              errores.push(`Fila ${index + 1}: Error de formato WKT - ${e}`);
            }
          } else if (Object.keys(row).length > 0 && results.meta.fields?.includes('WKT')) {
            // Si el archivo tiene columna WKT pero la celda está vacía
            errores.push(`Fila ${index + 1}: Falta WKT`);
          }
        });

        if (errores.length > 0) {
          console.error(`Errores de parseo en capa ${layerId}:`, errores);
          alert(`¡Atención! Se encontraron ${errores.length} errores al cargar ${layerId}:\n\n${errores.slice(0, 3).join('\n')}${errores.length > 3 ? '\n... y más' : ''}\n\nRevise la consola para más detalles.`);
        }

        if (features.length > 0) {
          const geojson = {
            type: 'FeatureCollection',
            features: features
          };

          const layer = L.geoJSON(geojson as any, {
            style: (feature: any) => {
              const fColor = feature.properties.color || color;
              return {
                color: fColor,
                weight: 2,
                opacity: 0.8,
                fillColor: fColor,
                fillOpacity: 0.3
              };
            },
            onEachFeature: (feature, layer) => {
              const props = feature.properties;
              layer.bindPopup(`<strong>${props.nombre}</strong><br>${props.descripcion}`);
            }
          });

          this.layersGroup[layerId] = layer;
          const capaConfig = this.capas.find(c => c.id === layerId);
          if (capaConfig?.visible) {
            layer.addTo(this.map);
          }
        }
      },
      error: (err) => console.error(`Error cargando CSV ${url}:`, err)
    });
  }

  private cargarDatosADR(): Promise<void> {
    return new Promise((resolve, reject) => {
      Papa.parse('./assets/adr_departamentos.csv', {
        download: true,
        header: true,
        delimiter: ',',
        skipEmptyLines: true,
        complete: (result: { data: any[]; }) => {
          this.departamentosADR = result.data
            .filter((item: any) => item.provincia && item.departamento)
            .map((item: any) => ({
              provincia: this.normalizarTexto(item.provincia),
              departamento: this.normalizarTexto(item.departamento),
              en_adr: parseInt(item.en_adr || '0')
            }));
          resolve();
        },
        error: (error: any) => {
          reject(error);
        }
      });
    });
  }

  private cargarDatosDepartamentos(): Promise<void> {
    return new Promise((resolve, reject) => {
      const provincias = ['santa_fe', 'misiones', 'cordoba', 'entre_rios', 'corrientes'];
      let promesas: Promise<void>[] = [];

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
                    datosCompletos: item
                  };
                });
              this.departamentosConDatos = [...this.departamentosConDatos, ...datosProvincia];
              resolveProvince();
            },
            error: (error: any) => {
              resolveProvince();
            }
          });
        });
        promesas.push(promesa);
      });

      Promise.all(promesas).then(() => {
        resolve();
      }).catch(error => {
        reject(error);
      });
    });
  }

  private parseNumericValue(value: string): number {
    if (!value) return 0;
    const cleanValue = value.replace(',', '.');
    const numValue = parseFloat(cleanValue);
    return isNaN(numValue) ? 0 : numValue;
  }

  private loadTopoJson(): void {
    const provincias = ['santa_fe', 'cordoba', 'corrientes', 'entre_rios', 'santiago_del_estero', 'misiones'];
    const promesas = provincias.map(provincia => {
      const url = `./assets/departamentos-${provincia}.topojson`;
      return fetch(url)
        .then(response => {
          if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
          return response.json().then(topoData => ({ provincia, topoData }));
        })
        .catch(error => null);
    });

    Promise.all(promesas).then(results => {
      const geoJsonFeatures: any[] = [];
      results.forEach(result => {
        if (result && result.topoData && result.topoData.objects) {
          const objectName = Object.keys(result.topoData.objects)[0];
          if (objectName) {
            const geoJsonData = topojson.feature(result.topoData, result.topoData.objects[objectName]) as any;
            if (geoJsonData.features && geoJsonData.features.length > 0) {
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
        const combinedGeoJson = {
          type: 'FeatureCollection',
          features: geoJsonFeatures
        };
        this.renderGeoJson(combinedGeoJson);
      }
    });
  }

  private renderGeoJson(geoJsonData: any): void {
    if (this.geoJsonLayer) {
      this.map.removeLayer(this.geoJsonLayer);
    }

    this.geoJsonLayer = L.geoJSON(geoJsonData, {
      style: (feature) => this.estilizarDepartamento(feature),
      onEachFeature: (feature, layer) => {
        const propiedades = feature.properties;
        const nombre = propiedades.departamento || propiedades.nam || propiedades.nombre || 'Desconocido';
        const provincia = propiedades.provincia || 'SANTA FE';
        const nombreNormalizado = this.normalizarTexto(nombre);
        const provinciaNormalizada = this.normalizarTexto(provincia);

        const estaEnADR = this.estaEnADR(provinciaNormalizada, nombreNormalizado);
        const tieneDatos = this.tieneDatos(provinciaNormalizada, nombreNormalizado);
        let estado = tieneDatos ? 'Con datos' : (estaEnADR ? 'En ADR, sin datos' : 'Fuera de ADR y sin datos');

        const datosDepartamento = this.obtenerDatosDepartamento(provinciaNormalizada, nombreNormalizado);

        let popupContent = `
          <div class=\"departamento-popup\">
            <h3>${nombre}</h3>
            <p>Provincia: ${provincia}</p>
            <p>Estado: ${estado}</p>
        `;

        if (tieneDatos && datosDepartamento) {
          popupContent += `
            <div class=\"datos-detalle\">
              <h4>Información detallada:</h4>
              <table>
                <tr><td>Titulares:</td><td>${datosDepartamento.recuentoTitular}</td></tr>
                <tr><td>Establecimientos:</td><td>${datosDepartamento.recuentoEstablecimiento}</td></tr>
                <tr><td>Hectáreas sembradas:</td><td>${datosDepartamento.hectareasSembradas?.toLocaleString('es-AR')} ha</td></tr>
                <tr><td>Hectáreas de no clientes:</td><td>${datosDepartamento.hectareasNoClientes?.toLocaleString('es-AR')} ha</td></tr>
                <tr><td>% Hectáreas no clientes:</td><td>${datosDepartamento.porcentajeNoClientes}</td></tr>
              </table>
            </div>
          `;
        }
        popupContent += `</div>`;
        layer.bindPopup(popupContent);

        layer.on({
          mouseover: (e) => {
            const l = e.target;
            l.setStyle({ weight: 3, color: '#666', fillOpacity: 0.7 });
            l.bringToFront();
          },
          mouseout: (e) => { this.geoJsonLayer?.resetStyle(e.target); },
          click: (e) => { this.map.fitBounds(e.target.getBounds()); }
        });
      }
    }).addTo(this.map);

    if (this.geoJsonLayer.getBounds().isValid()) {
      this.map.fitBounds(this.geoJsonLayer.getBounds());
    }
  }

  private estilizarDepartamento(feature: any): L.PathOptions {
    const propiedades = feature.properties;
    const nombre = propiedades.departamento || propiedades.nam || propiedades.nombre || '';
    const provincia = propiedades.provincia || 'SANTA FE';
    const nombreNormalizado = this.normalizarTexto(nombre);
    const provinciaNormalizada = this.normalizarTexto(provincia);

    const tieneDatos = this.tieneDatos(provinciaNormalizada, nombreNormalizado);
    const estaEnADR = this.estaEnADR(provinciaNormalizada, nombreNormalizado);

    let color = '#808080';
    const capaRegionales = this.capas.find(c => c.id === 'datos_regionales');
    if (capaRegionales?.visible) {
      if (tieneDatos) color = '#4CAF50';
      else if (estaEnADR) color = '#3388ff';
    }

    return { color: '#333', weight: 1, opacity: 0.8, fillColor: color, fillOpacity: 0.7 };
  }

  public toggleCapa(id: string): void {
    const capa = this.capas.find(c => c.id === id);
    if (!capa) return;

    if (id === 'datos_regionales') {
      if (this.geoJsonLayer) this.geoJsonLayer.setStyle((f) => this.estilizarDepartamento(f));
    } else {
      const layer = this.layersGroup[id];
      if (layer) {
        if (capa.visible) layer.addTo(this.map);
        else this.map.removeLayer(layer);
      }
    }
  }

  private estaEnADR(provincia: string, departamento: string): boolean {
    return this.departamentosADR.some(d => d.provincia === provincia && d.departamento === departamento && d.en_adr === 1);
  }

  private tieneDatos(provincia: string, departamento: string): boolean {
    return this.departamentosConDatos.some(d => d.provincia === provincia && d.departamento === departamento);
  }

  private obtenerDatosDepartamento(provincia: string, departamento: string): DepartamentoDatos | null {
    return this.departamentosConDatos.find(d => d.provincia === provincia && d.departamento === departamento) || null;
  }

  private normalizarTexto(texto: string): string {
    if (!texto) return '';
    return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').replace(/\./g, '').replace(/_/g, ' ').trim();
  }
}