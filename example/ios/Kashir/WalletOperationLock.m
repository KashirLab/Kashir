#import <React/RCTBridgeModule.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/file.h>
#include <unistd.h>

@interface WalletOperationLock : NSObject <RCTBridgeModule>
@end

@implementation WalletOperationLock {
  NSMutableDictionary<NSString *, NSNumber *> *_leases;
}

RCT_EXPORT_MODULE()

- (instancetype)init
{
  if ((self = [super init])) {
    _leases = [NSMutableDictionary new];
  }
  return self;
}

RCT_EXPORT_METHOD(sharedContainer:(NSString *)group
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *container = [NSFileManager.defaultManager containerURLForSecurityApplicationGroupIdentifier:group];
  if (container == nil) {
    reject(@"wallet_app_group", @"The shared wallet container is unavailable.", nil);
    return;
  }
  resolve(container.path);
}

RCT_EXPORT_METHOD(acquire:(NSString *)databasePath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSString *lockPath = [databasePath stringByAppendingString:@".lock"];
  int descriptor = open(lockPath.fileSystemRepresentation, O_CREAT | O_RDWR | O_CLOEXEC, 0600);
  if (descriptor < 0) {
    reject(@"wallet_lock_open", @"Could not open the wallet lock.", nil);
    return;
  }

  if (flock(descriptor, LOCK_EX | LOCK_NB) != 0) {
    int error = errno;
    close(descriptor);
    if (error == EWOULDBLOCK) {
      reject(@"wallet_lock_busy", @"The wallet is busy. Try again in a moment.", nil);
    } else {
      reject(@"wallet_lock_acquire", @"Could not acquire the wallet lock.", nil);
    }
    return;
  }

  NSString *lease = NSUUID.UUID.UUIDString;
  @synchronized (self) {
    _leases[lease] = @(descriptor);
  }
  resolve(lease);
}

RCT_EXPORT_METHOD(releaseLease:(NSString *)lease
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  @synchronized (self) {
    NSNumber *descriptor = _leases[lease];
    if (descriptor != nil) {
      close(descriptor.intValue);
      [_leases removeObjectForKey:lease];
    }
  }
  resolve(nil);
}

- (void)dealloc
{
  for (NSNumber *descriptor in _leases.allValues) {
    close(descriptor.intValue);
  }
}

@end
