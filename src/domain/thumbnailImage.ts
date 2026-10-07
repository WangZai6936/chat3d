/** Local raster previews only. Both real WebGL JPEG and software PNG are supported. */
export function isThumbnailImage(value:unknown):value is string{
 return typeof value==='string'&&value.length<=2*1024*1024&&/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value);
}
