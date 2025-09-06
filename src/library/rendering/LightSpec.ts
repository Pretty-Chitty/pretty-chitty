export class Light {
  public angleRadians = Math.PI * (3 / 4);
  public angleElevationRadians = Math.PI / 4;
  public color = 0xffffff;
  public intensity = 1;
  public shadow = true;

  // TODO: extra stuff for spot lights?
}

export class LightSpec {
  public ambientColor = 0xffffff;
  public ambientIntensity = 1.0;

  public shadowOpacity = 0.3;
  public shadowColor = 0x000000;

  public shadowZDepth = 0.001;
  public lights: Light[] = [];

  // friendly default
  static realistic() {
    const result = new LightSpec();

    result.ambientIntensity = 0.3;

    const light1 = new Light();
    light1.intensity = 1.5;
    light1.angleRadians = Math.PI * (2.75 / 4);
    light1.angleElevationRadians = Math.PI * (0.75 / 4); // Math.PI * (3 / 4);
    result.lights.push(light1);

    const light2 = new Light();
    light2.intensity = 1.5;
    light2.angleRadians = -Math.PI * (6.6 / 8);
    light2.angleElevationRadians = Math.PI * (1.5 / 4); // Math.PI * (3 / 4);
    result.lights.push(light2);

    return result;
  }
}
