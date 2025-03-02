import Color from "color";

export class GameTheme {
  public backgroundColor = "#0f0119";

  public spacing = 8;
  public bottomBarHeight = 80;
  public topBarHeight = 56;
  public barColor = "#1c092c";
  public barGradientPercent = 0.05;
  public barGradientAngle = 110;

  public backgroundGradientPercent = 0.2;
  public backgroundGradientAngle = 150;

  public actionBarColor = "#3a1957";
  public actionBarAnimationDuration = "0.3s";
  public barTextColor = "rgba(255,255,255,0.6)";
  public barTextHighlightColor = "rgba(255,255,255,0.6)";
  public barBreak = "rgba(255,255,255,0.3)";
  public barActiveTextColor = "rgba(255,255,255,0.9)";
  public barHighlightTextColor = "#66d5c1";
  public barDisabledTextColor = "rgba(255,255,255,0.2)";
  public panelSlotColor = "#858b99";
  public panelSlotSelectedColor = "#66d5c1";
  public fullResetColor = "#66d5c1";
  public barTopDropdownColor = "#1c092c";
  public barTopLineColor = "rgba(255,255,255,0.1)";

  public endGameBackgroundColor = "#1c092c";
  public endGameTextColor = "rgba(255,255,255,1)";

  public chitHighlightColor = "#66d5c144";
  public chitInnerHighlightColor = "#66d5c1";

  public panelSelectionCutoutBackground = "#ffffff";
  public panelSelectionCutoutSelected = "#66d5c1";

  public dialogBackgroundColor = "rgba(0,0,0,0.8)";
  public dialogForegroundColor = "#ffffff";

  public sparkForegroundColor = "#222";
  public sparkDuration = 200;
  public sparkBorderWidth = 4;
  public sparkBorderColor = "rgba(0,0,0,0.3)";
  public sparkFlashColor = "#0ff";

  static withDefaults(primaryColor: string, highlight: string) {
    const result = new GameTheme();
    result.chitInnerHighlightColor = highlight;
    result.chitHighlightColor = Color(highlight).alpha(0.2).hexa();
    result.backgroundColor = Color(primaryColor).darken(0.5).hex();
    result.barColor = primaryColor;
    result.actionBarColor = Color(primaryColor).mix(Color(highlight), 0.4).hex();
    result.fullResetColor = highlight;
    result.barHighlightTextColor = highlight;
    result.barTopDropdownColor = Color(primaryColor).lighten(0.1).alpha(0.9).hexa();
    result.barTextHighlightColor = highlight;

    result.endGameBackgroundColor = result.barTopDropdownColor;
    return result;
  }
}
