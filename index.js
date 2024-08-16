
import { Util, MicroTask, Layer, Geometry } from 'maptalks';

let jsts;
let geojsonRender;
// const geojsonWriter = new jsts.io.GeoJSONWriter();
const JSTS_ISNULL = 'jsts namespace is null, please injectJSTS(jsts)';
const FILTER_PAGESIZE = 40000;
const SPATIAL_PAGESIZE = 3000;

export function injectJSTS(jstsNameSpace) {
    jsts = jstsNameSpace;
}

// export function getJSTS() {
//     return jsts;
// }

function checkJSTS() {
    if (!jsts) {
        console.error(JSTS_ISNULL);
        return false;
    }
    if (!geojsonRender) {
        geojsonRender = new jsts.io.GeoJSONReader();
    }
    return true;
}

function flatGeos(layer, result) {
    if (layer.getGeometries) {
        return result;
    }
    const geos = [];
    const tiles = result;
    // vt
    for (let i = 0, len = tiles.length; i < len; i++) {
        const features = tiles[i].features || [];
        for (let j = 0, len1 = features.length; j < len1; j++) {
            const feature = features[j].feature;
            if (feature && feature.geometry) {
                geos.push(feature);
            }
        }
        // Util.pushIn(geos, features);
    }
    return geos;
}

export class Query {
    constructor(map) {
        this.map = map;
    }

    _filterLayers(layers) {
        if (!this.map) {
            console.error('not find map');
            return [];
        }
        if (!Array.isArray(layers) && layers && layers instanceof Layer) {
            layers = [layers];
        }
        layers = layers || [];
        if (layers.length === 0) {
            const allLayers = this.map._getLayers() || [];
            allLayers.forEach(layer => {
                layers.push(layer);
                if (layer && layer.getLayers) {
                    const childLayers = layer.getLayers() || [];
                    Util.pushIn(layer, childLayers);
                }
            });
        }
        return layers.filter(layer => {
            return !!(layer.getGeometries || layer.getRenderedFeatures || layer.getRenderedFeaturesAsync);
        });
    }

    _getLayerGeos(layer, callback) {
        let geos = [];
        if (!layer) {
            callback(geos);
            return;
        }
        if (layer.getGeometries) {
            geos = layer.getGeometries();
            callback(flatGeos(layer, geos));
        } else if (layer.getRenderedFeaturesAsync) {
            layer.getRenderedFeaturesAsync().then(result => {
                callback(flatGeos(layer, result));
            }).catch(error => {
                console.error(error);
                callback(geos);
            });
        } else if (layer.getRenderedFeatures) {
            geos = layer.getRenderedFeatures();
            callback(flatGeos(layer, geos));
        } else {
            console.error('not support current layer:', layer);
            callback(geos);
        }
    }

    _getLayersGeos(layers, callback) {
        const data = [];
        if (!layers || layers.length === 0) {
            callback(data);
            return;
        }
        let idx = 0;
        const load = () => {
            if (idx === layers.length) {
                callback(data);
            } else {
                const layer = layers[idx];
                this._getLayerGeos(layer, geos => {
                    geos.forEach(geo => {
                        data.push({ layer, geo });
                    });
                    idx++;
                    load();
                });
            }
        };
        load();
    }

    _filterGeos(data, filter) {
        return new Promise((resolve, reject) => {
            if (!filter || !Util.isFunction(filter)) {
                resolve(data);
                return;
            }
            const pageSize = FILTER_PAGESIZE;
            const count = Math.ceil(data.length / pageSize);
            let page = 1;
            const result = [];
            const run = () => {
                const startIndex = (page - 1) * pageSize,
                    endIndex = page * pageSize;
                const list = data.slice(startIndex, endIndex);
                for (let i = 0, len = list.length; i < len; i++) {
                    const { geo, layer } = list[i];
                    if (filter.call(this, geo, layer)) {
                        result.push(list[i]);
                    }
                }
                page++;
            };
            MicroTask.runTaskAsync({ run, count }).then(() => {
                resolve(result);
            }).catch(error => {
                reject(error);
            });
        });
    }

    _spatialFilterGeos(data, geometry) {
        return new Promise((resolve, reject) => {
            const geoJSON = geometry.toGeoJSON();
            let queryGeo;
            try {
                queryGeo = geojsonRender.read(geoJSON).geometry;
            } catch (error) {
                console.error(error);
                reject(new Error('geometry.geoJSON() error', geometry));
                return;
            }
            const pageSize = SPATIAL_PAGESIZE;
            const count = Math.ceil(data.length / pageSize);
            let page = 1;
            const result = [];
            const TEMPFEATURE = {
                type: 'Feature',
                geometry: null
            };
            const run = () => {
                const startIndex = (page - 1) * pageSize,
                    endIndex = page * pageSize;
                const list = data.slice(startIndex, endIndex);
                for (let i = 0, len = list.length; i < len; i++) {
                    const { geo, layer } = list[i];
                    let feature, jstsGeo;
                    try {
                        if (geo.toGeoJSON) {
                            feature = geo.toGeoJSON();
                        } else if (geo.geometry) {
                            TEMPFEATURE.geometry = geo.geometry;
                            feature = TEMPFEATURE;
                        }
                        if (!feature) {
                            console.error('not support geo type:', geo, layer);
                            continue;
                        }
                    } catch (error) {
                        console.error(error);
                        console.error('geo to geojson error:', geo, layer);
                    }
                    if (!feature) {
                        continue;
                    }
                    try {
                        jstsGeo = geojsonRender.read(feature).geometry;
                    } catch (error) {
                        console.error(error);
                        console.error('geo to jsts geo error:', geo, layer);
                    }
                    if (!jstsGeo) {
                        continue;
                    }
                    try {
                        if (queryGeo.intersects(jstsGeo)) {
                            result.push(list[i]);
                        }
                    } catch (error) {
                        console.error(error);
                        console.error('geo spatial cal:', geo);
                    }
                }
                page++;
            };
            MicroTask.runTaskAsync({ run, count }).then(() => {
                resolve(result);
            }).catch(error => {
                reject(error);
            });
        });
    }

    _formatResult(data) {
        const map = new Map();
        for (let i = 0, len = data.length; i < len; i++) {
            const { layer, geo } = data[i];
            let geos = map.get(layer);
            if (!geos) {
                geos = [];
                map.set(layer, geos);
            }
            geos.push(geo);
        }
        const result = [];
        for (const item of map) {
            const [layer, geos] = item;
            result.push({
                layer,
                geometries: geos
            });
        }
        return result;
    }

    query(options = {}) {
        return new Promise((resolve, reject) => {
            const { filter, layers } = options;
            if (!Util.isFunction(filter)) {
                reject(new Error('filter is not function'));
                return;
            }
            const filterLayers = this._filterLayers(layers);
            this._getLayersGeos(filterLayers, data => {
                this._filterGeos(data, filter).then(filterData => {
                    const result = this._formatResult(filterData);
                    resolve(result);
                }).catch(error => {
                    reject(error);
                });
            });
        });
    }

    spatialQuery(options = {}) {
        return new Promise((resolve, reject) => {
            const { filter, layers, geometry } = options;
            if (!geometry || !(geometry instanceof Geometry)) {
                reject(new Error('geometry is not maptalks.Geometry'));
                return;
            }
            const filterLayers = this._filterLayers(layers);
            this._getLayersGeos(filterLayers, data => {
                this._filterGeos(data, filter).then(list => {
                    if (!checkJSTS()) {
                        reject(new Error(JSTS_ISNULL));
                    } else {
                        this._spatialFilterGeos(list, geometry).then(filterData => {
                            const result = this._formatResult(filterData);
                            resolve(result);
                        }).catch(error => {
                            reject(error);
                        });
                    }
                }).catch(error => {
                    reject(error);
                });
            });
        });
    }

}
