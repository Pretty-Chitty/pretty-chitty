import Color from "color";

export const DEFAULT_FONT_FAMILY = "Quicksand, sans-serif";

/**
 * Controls color scheme and layout options for all things in a pretty-chitty game.  Much of
 * this can be overridden per chit, but some cannot.  For example, the background color of the game
 * is controlled here while the default chitHighlightColor is set here, but can be overridden per chit.
 *
 * Highly recommend using `GameTheme.withDefaults(primaryColor, highlightColor, textColor)` to
 * generate a base theme and then override what you need from there.
 *
 * @group Core Game Elements
 */
export class GameTheme {
  public static defaultFontFamily = DEFAULT_FONT_FAMILY;

  private _fontFamily = DEFAULT_FONT_FAMILY;
  public get fontFamily() {
    return this._fontFamily;
  }
  public set fontFamily(value: string) {
    this._fontFamily = value;
    GameTheme.defaultFontFamily = value;
  }

  public backgroundColor = "#0f0119";

  public spacing = 8;
  public bottomBarHeight = 80;
  public topBarHeight = 40;
  public barColor = "#1c092c";
  public barGradientPercent = 0.05;
  public barGradientAngle = 110;

  public backgroundGradientPercent = 0.2;
  public backgroundGradientAngle = 150;

  public actionBarColor = "#3a1957";
  public actionBarAnimationDuration = 0.3;
  public actionBarContextColor = "#3a1957";
  public actionBarContextAnimationDuration = 0.3;
  public actionBarContextShadow = "rgba(0,0,0,0.2)";
  public actionBarToggleSelectedColor = "rgba(255,255,255,0.6)";

  public barTextColor = "rgba(255,255,255,0.6)";
  public barTextHighlightColor = "rgba(255,255,255,0.6)";
  public barBreak = "rgba(255,255,255,0.3)";
  public barActiveTextColor = "rgba(255,255,255,0.9)";
  public barHighlightTextColor = "#66d5c1";
  public barDisabledTextColor = "rgba(255,255,255,0.3)";
  public panelSlotColor = "#858b99";
  public panelSlotSelectedColor = "#66d5c1";
  public fullResetColor = "#66d5c1";
  public barTopDropdownColor = "#1c092c";
  public barTopLineColor = "rgba(255,255,255,0.1)";

  public endGameBackgroundColor = "#1c092c";
  public endGameTextColor = "rgba(255,255,255,1)";

  public chitHighlightColor = "#66d5c1";
  public chitOutlineWidth = 3;
  public chitOutlineStrength = 0.75;

  public panelSelectionCutoutBackground = "#ffffff";
  public panelSelectionCutoutSelected = "#66d5c1";

  public dialogBackgroundColor = "rgba(0,0,0,0.5)";
  public dialogForegroundColor = "#ffffff";
  public dialogFontSize = 14;

  public sparkForegroundColor = "#222";
  public sparkDuration = 200;
  public sparkBorderWidth = 4;
  public sparkPadding = 2;
  public sparkBorderColor = "rgba(0,0,0,0.3)";
  public sparkFlashColor = "#0ff";
  public sparkSize = 20;
  public sparkFontSize = 12;
  public topBarDropShadowColor = "rgba(0,0,0,0.7)";
  public topBarPlayerDropShadowColor = "rgba(0,0,0,0.2)";

  public galleryItemWidth = 150;
  public galleryItemHeight: number | undefined;
  public galleryItemSpacing = 20;
  public galleryItemMinimumWidth = 75;
  public galleryItemMinimumHeight = 50;

  public gallerySummaryBackgroundColor = "#000000";
  public gallerySummaryBackgroundOpacity = 0.7;

  public actionLogBackgroundColor = "rgba(255,255,255,0.05)";
  public actionLogDialogBackgroundColor = "#000000";
  public actionLogDialogHighlightBackgroundColor = "rgba(255,255,255,0.3)";
  public actionLogTextColor = "#ffffff";
  public actionBarWidth = 600;
  public actionBarLinesToShow = 2;
  public inlineGalleryBackgroundColor = "rgba(255,255,255,0.1)";
  public inlineGalleryButtonBackgroundColor = "#000000";
  public inlineGalleryButtonForegroundColor = "rgba(255,255,255,0.5)";

  /** Reference to .png or .jpg file to show as box art in advertising the game */
  public boxArt = "";
  /** Reference to .png or .jpg file to show as a screenshot in advertising the game */
  public screenshot = "";

  static withDefaults(primaryColor: string, highlight: string, textColor: string = "#ffffff") {
    const result = new GameTheme();
    result.chitHighlightColor = highlight;
    result.backgroundColor = Color(primaryColor).darken(0.5).hex();
    result.barColor = primaryColor;
    result.actionBarColor = Color(primaryColor).mix(Color(highlight), 0.4).hex();
    result.actionBarContextColor = primaryColor;
    result.fullResetColor = highlight;
    result.barHighlightTextColor = highlight;
    result.barTopDropdownColor = Color(primaryColor).mix(Color(highlight), 0.1).alpha(0.9).hexa();
    result.barTextHighlightColor = highlight;
    result.actionBarToggleSelectedColor = primaryColor;

    result.inlineGalleryButtonBackgroundColor = primaryColor;

    result.endGameBackgroundColor = result.barTopDropdownColor;

    result.barTextColor = Color(textColor).alpha(0.9).hexa();
    result.barTextHighlightColor = Color(textColor).mix(Color(highlight), 0.5).alpha(0.9).hexa();
    result.barBreak = Color(textColor).alpha(0.3).hexa();
    result.barActiveTextColor = Color(textColor).alpha(0.9).hexa();
    result.barTopLineColor = Color(textColor).alpha(0.1).hexa();
    result.endGameTextColor = Color(textColor).alpha(1).hexa();

    result.actionLogTextColor = result.barActiveTextColor;
    result.actionLogDialogBackgroundColor = result.backgroundColor;

    return result;
  }

  layoutSize(width: number): "large" | "medium" | "mobile" {
    return width >= this.actionBarWidth * 2 ? "large" : width >= this.actionBarWidth * 1.3 ? "medium" : "mobile";
  }
}
