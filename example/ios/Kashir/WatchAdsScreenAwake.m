#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface WatchAdsScreenAwake : NSObject <RCTBridgeModule>
@end

@implementation WatchAdsScreenAwake {
  NSNumber *_previousIdleTimerDisabled;
}

RCT_EXPORT_MODULE()

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

RCT_EXPORT_METHOD(setEnabled:(BOOL)enabled)
{
  UIApplication *application = UIApplication.sharedApplication;
  if (enabled && _previousIdleTimerDisabled == nil) {
    _previousIdleTimerDisabled = @(application.idleTimerDisabled);
    application.idleTimerDisabled = YES;
  } else if (!enabled && _previousIdleTimerDisabled != nil) {
    application.idleTimerDisabled = _previousIdleTimerDisabled.boolValue;
    _previousIdleTimerDisabled = nil;
  }
}

@end
